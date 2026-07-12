// Package relay is the portable core of the collaborative relay: room registry, RBAC enforcement, rate
// limiting, frame protocol, and CRDT merge (via y-crdt) — ported in *behavior* from the JS relay this
// replaces. It is parameterized entirely over the Socket/Store/Authorizer/RoomAuthorizer interfaces above,
// with zero knowledge of how a connection actually arrived (a real network socket, or — Milestone 2 — an
// in-process WASM-side connection): that is the one implementation both production and the demo run.
//
// The JS original could rely on single-threaded execution to serialize all room/socket mutations for
// free; Go connections run on real goroutines, so this port adds explicit locking around shared state —
// a correctness requirement of the language change, not a "mode". Two locks: the global Core.mu guards
// the room registry and each room's cheap membership/metadata (sockets, seeder, pending, saveTimer), while
// a per-room room.docMu guards the CRDT document's contents (the heavy ApplyUpdate/EncodeStateAsUpdate) so
// one room's large update can't stall every other room. When both are needed the order is docMu → Core.mu.
package relay

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	ycrdt "github.com/skyterra/y-crdt"
)

// Frame tags — identical to the JS relay's wire protocol.
const (
	tagDoc     byte = 0
	tagAware   byte = 1
	tagControl byte = 2
	tagAuth    byte = 3
)

const (
	saveDebounce       = 400 * time.Millisecond
	maxPendingFrames   = 64
	maxPendingBytes    = 8 << 20 // total bytes buffered before auth — a frame count alone let a peer pin 64×maxFrame
	maxRooms           = 10_000
	viewerDropLogEvery = 5 * time.Second
	// How long an AuthRequired connection may stay unauthenticated before it is dropped. Without it a peer
	// that connects and never sends an AUTH frame holds its goroutines and socket slot forever.
	defaultAuthHandshakeTimeout = 10 * time.Second
)

var segmentRE = regexp.MustCompile(`^[A-Za-z0-9._~-]+$`)

// Close codes (RFC 6455 / the JS relay's usage).
const (
	closePolicy        = 1008
	closeInternal      = 1011
	closeTryAgainLater = 1013
)

// Logger is the minimal logging seam — defaults to the standard library logger. Injectable so tests stay
// quiet without needing a real io.Writer plumbing exercise.
type Logger interface {
	Printf(format string, args ...any)
}

// Options configures a Core. All fields are optional; the zero value matches the JS relay's own
// zero-config defaults (in-memory-equivalent via the caller's Store, allow-all auth, editor-by-default
// RBAC, DefaultRateLimit, wall-clock time).
type Options struct {
	Store         Store
	Authorize     Authorizer
	AuthRequired  bool
	AuthorizeRoom RoomAuthorizer
	RateLimit     RateLimit
	Now           func() time.Time
	Logger        Logger
	// AuthHandshakeTimeout bounds how long an AuthRequired connection may stay unauthenticated. Zero uses
	// defaultAuthHandshakeTimeout; a negative value disables the reaper (tests that never authenticate).
	AuthHandshakeTimeout time.Duration
}

// Core is the room registry + connection admission logic. Safe for concurrent use by multiple goroutines
// (one per connection, typically).
type Core struct {
	mu    sync.Mutex
	rooms map[string]*room

	store         Store
	authorize     Authorizer
	authRequired  bool
	authorizeRoom RoomAuthorizer
	rateLimit     RateLimit
	now           func() time.Time
	log           Logger
	authHandshake time.Duration
}

type room struct {
	// docMu guards the CRDT document's CONTENTS (ApplyUpdate / EncodeStateAsUpdate / emptiness). It is a
	// SEPARATE, per-room lock so a large update in one room does not stall every other room's admissions,
	// broadcasts and saves the way holding the global Core.mu across the CRDT work did. The `doc` POINTER
	// is set once at room creation and never reassigned, so reading it needs no lock; only its contents do.
	// Lock ORDER when both are needed (the seed decision, dropSocket): docMu OUTER, then Core.mu INNER —
	// never the reverse, so the two locks can't deadlock.
	docMu     sync.Mutex
	doc       *ycrdt.Doc
	sockets   map[Socket]struct{}
	saveTimer *time.Timer
	// Admissions that have looked this room up in the registry but not yet registered their socket.
	// Guarded by Core.mu. dropSocket may forget an empty room only when this is zero too — otherwise a
	// concurrent joiner between the lookup and the registration would be left on a ghost room while the
	// next joiner loads a fresh Doc for the same name, forking the document.
	pending int
	// The one live connection allowed to seed this still-empty room's initial content. Granted to the
	// first admission into an empty room, re-granted to a surviving peer if the holder disconnects while
	// the room is still empty, and irrelevant once the doc has content (grants gate on emptiness too).
	// Fixes the seed race: two fresh clients admitted concurrently would otherwise BOTH see an empty doc
	// and both insert their initial source, and Y.Text would merge the two inserts into a duplicate.
	seeder Socket
}

// The reserved CONTROL message granting seed rights (distinct from the role strings, which are the only
// other CONTROL payloads). The client seeds the room's initial content only after receiving this.
const seedGrantMessage = "seed"

// docIsEmpty reports whether the room's doc has no content at all (an empty state vector — nothing was
// ever inserted, by any client). Callers hold the room's docMu (it reads the CRDT contents).
func docIsEmpty(doc *ycrdt.Doc) bool {
	return len(ycrdt.GetStateVector(doc.Store)) == 0
}

// New builds a Core. A nil/zero-value Options field falls back to the same defaults `startRelay` uses in
// the JS relay.
func New(opts Options) *Core {
	if opts.Store == nil {
		opts.Store = newDefaultMemoryStore()
	}
	if opts.Authorize == nil {
		opts.Authorize = AllowAll
	}
	if opts.AuthorizeRoom == nil {
		opts.AuthorizeRoom = NewClaimsRoleResolver(RoleEditor)
	}
	if opts.RateLimit == (RateLimit{}) {
		opts.RateLimit = DefaultRateLimit
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Logger == nil {
		opts.Logger = log.Default()
	}
	if opts.AuthHandshakeTimeout == 0 {
		opts.AuthHandshakeTimeout = defaultAuthHandshakeTimeout
	}
	return &Core{
		rooms:         make(map[string]*room),
		store:         opts.Store,
		authorize:     opts.Authorize,
		authRequired:  opts.AuthRequired,
		authorizeRoom: opts.AuthorizeRoom,
		rateLimit:     opts.RateLimit,
		now:           opts.Now,
		log:           opts.Logger,
		authHandshake: opts.AuthHandshakeTimeout,
	}
}

// roomName extracts and validates the room id from a connection URL's path. Returns ("", false) for a
// malformed name — the caller rejects rather than normalising a bad name.
func roomName(rawURL string) (string, bool) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", false
	}
	raw, err := url.PathUnescape(strings.TrimLeft(u.Path, "/"))
	if err != nil {
		return "", false
	}
	if raw == "" {
		return "default", true
	}
	if !validRoomName(raw) {
		return "", false
	}
	return raw, true
}

// validRoomName: one or two non-empty `<tenant>/<id>` segments; `.`/`..` and empty segments are barred.
func validRoomName(name string) bool {
	segments := strings.Split(name, "/")
	if len(segments) == 0 || len(segments) > 2 {
		return false
	}
	for _, seg := range segments {
		if seg == "" || seg == "." || seg == ".." {
			return false
		}
		if !segmentRE.MatchString(seg) {
			return false
		}
	}
	return true
}

func docFrame(payload []byte) []byte {
	frame := make([]byte, len(payload)+1)
	frame[0] = tagDoc
	copy(frame[1:], payload)
	return frame
}

func controlFrame(message string) []byte {
	frame := make([]byte, len(message)+1)
	frame[0] = tagControl
	copy(frame[1:], message)
	return frame
}

// loadRoom returns the room for name, loading it from the store on first touch, and reserves a pending
// admission slot on it (the caller MUST register a socket or the connection dies before that — either way
// admit decrements `pending` exactly once). Returns (nil, nil) if the room cap is hit for a brand-new
// room; a Store.Load failure is returned, never swallowed — seeding an empty room over a transient load
// error would let the debounced save overwrite the good stored snapshot. First-touch uses double-checked
// locking: the store load runs outside c.mu, then the registry is re-checked under the lock; a concurrent
// loader that won the race keeps its room and ours is discarded, so two callers never install two
// divergent Docs for one room name (the JS original didn't need this — synchronous execution made it
// unreachable there; Go's real concurrency makes it reachable).
func (c *Core) loadRoom(name string) (*room, error) {
	c.mu.Lock()
	if r, ok := c.rooms[name]; ok {
		r.pending++
		c.mu.Unlock()
		return r, nil
	}
	if len(c.rooms) >= maxRooms {
		c.mu.Unlock()
		return nil, nil
	}
	c.mu.Unlock()

	snapshot, err := c.store.Load(name)
	if err != nil {
		return nil, fmt.Errorf("store load for room %q failed: %w", name, err)
	}
	doc := ycrdt.NewDoc(name, false, nil, nil, false)
	if snapshot != nil {
		if err := applyUpdateGuarded(doc, snapshot); err != nil {
			return nil, fmt.Errorf("stored snapshot for room %q is corrupt: %w", name, err)
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if r, ok := c.rooms[name]; ok {
		r.pending++
		return r, nil // a concurrent loader won the race — use its room, discard ours
	}
	if len(c.rooms) >= maxRooms {
		return nil, nil
	}
	r := &room{doc: doc, sockets: make(map[Socket]struct{}), pending: 1}
	c.rooms[name] = r
	return r, nil
}

func (c *Core) safeSave(name string, r *room) {
	r.docMu.Lock()
	snapshot := ycrdt.EncodeStateAsUpdate(r.doc, nil)
	r.docMu.Unlock()
	if err := c.store.Save(name, snapshot); err != nil {
		c.log.Printf("relay: store.Save(%q) failed — %v", name, err)
	}
}

func (c *Core) flush(name string, r *room) {
	c.mu.Lock()
	if r.saveTimer != nil {
		r.saveTimer.Stop()
		r.saveTimer = nil
	}
	c.mu.Unlock()
	c.safeSave(name, r)
}

// FlushAll persists every room's latest snapshot — call on a clean shutdown before exiting so a
// SIGINT/SIGTERM doesn't drop an edit still inside the debounce window.
func (c *Core) FlushAll() {
	c.mu.Lock()
	rooms := make(map[string]*room, len(c.rooms))
	for name, r := range c.rooms {
		rooms[name] = r
	}
	c.mu.Unlock()
	for name, r := range rooms {
		c.flush(name, r)
	}
}

// applyUpdateGuarded applies a CRDT update, recovering a panic (a malformed update makes y-crdt panic,
// mirroring the JS relay's throwing `applyUpdate`) into an error so one bad frame can't crash the relay.
func applyUpdateGuarded(doc *ycrdt.Doc, update []byte) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%v", r)
		}
	}()
	ycrdt.ApplyUpdate(doc, update, nil)
	return nil
}

var errAuthCheckFailed = errors.New("authorize check failed")

// conn is one connection's admission state machine.
type conn struct {
	core   *Core
	socket Socket

	mu                sync.Mutex
	phase             string // pending | open | closed
	pending           [][]byte
	pendingBytes      int
	room              *room
	name              string
	role              Role
	bucket            *rateBucket
	lastViewerDropLog time.Time
}

// Connect admits a new connection. req.URL selects the room; if AuthRequired, admission waits for the
// first AUTH-tagged frame before proceeding (buffering any frames sent before it, up to
// maxPendingFrames). Blocks until the connection is fully torn down (call it in its own goroutine per
// connection — see cmd/relay-server for the real transport adapter).
func (c *Core) Connect(socket Socket, req *Request) {
	cn := &conn{
		core:   c,
		socket: socket,
		phase:  "pending",
		bucket: newRateBucket(c.rateLimit, c.now),
	}

	socket.OnMessage(func(data []byte) {
		cn.mu.Lock()
		phase := cn.phase
		if phase == "open" {
			cn.mu.Unlock()
			cn.handle(data)
			return
		}
		if phase != "pending" {
			cn.mu.Unlock()
			return
		}
		if len(cn.pending) >= maxPendingFrames || cn.pendingBytes+len(data) > maxPendingBytes {
			cn.mu.Unlock()
			cn.reject(closePolicy, "flood before auth")
			return
		}
		if c.authRequired {
			cn.mu.Unlock()
			cn.startAuthFromFrame(data, req)
			return
		}
		cn.pending = append(cn.pending, data)
		cn.pendingBytes += len(data)
		cn.mu.Unlock()
	})

	done := make(chan struct{})
	socket.OnClose(func() {
		cn.mu.Lock()
		cn.phase = "closed"
		r := cn.room
		name := cn.name
		cn.mu.Unlock()
		if r != nil {
			c.dropSocket(name, r, socket)
		}
		close(done)
	})

	// Reap a connection that authenticates too slowly (or never) so an unauthenticated peer can't hold its
	// goroutines and socket slot indefinitely. Stopped once the session ends (admitted or closed).
	if c.authRequired && c.authHandshake > 0 {
		reaper := time.AfterFunc(c.authHandshake, func() {
			cn.mu.Lock()
			stillPending := cn.phase == "pending"
			cn.mu.Unlock()
			if stillPending {
				cn.reject(closePolicy, "auth handshake timeout")
			}
		})
		defer reaper.Stop()
	}

	if !c.authRequired {
		cn.admit(context.Background(), req)
	}
	<-done
}

func (cn *conn) admit(ctx context.Context, req *Request) {
	c := cn.core
	auth, err := c.authorize(ctx, req)
	if err != nil {
		c.log.Printf("relay: authorize threw — %v", err)
		cn.mu.Lock()
		cn.phase = "closed"
		cn.mu.Unlock()
		cn.socket.Close(closeInternal, "auth error")
		return
	}
	if cn.closedNow() {
		return // client gave up while we verified
	}
	if !auth.OK {
		reason := auth.Reason
		if reason == "" {
			reason = "unauthorized"
		}
		cn.reject(closePolicy, reason)
		return
	}

	name, ok := roomName(req.URL)
	if !ok {
		cn.reject(closePolicy, "invalid room name")
		return
	}

	role := c.authorizeRoom(auth.User, name)
	if cn.closedNow() {
		return
	}
	if role == "" {
		cn.reject(closePolicy, fmt.Sprintf("forbidden: %s", name))
		return
	}

	r, err := c.loadRoom(name)
	if err != nil {
		c.log.Printf("relay: loadRoom(%q) failed — %v", name, err)
		cn.mu.Lock()
		cn.phase = "closed"
		cn.mu.Unlock()
		cn.socket.Close(closeInternal, "room load error")
		return
	}
	if r == nil {
		cn.reject(closeTryAgainLater, "server full")
		return
	}

	cn.mu.Lock()
	cn.role = role
	cn.room = r
	cn.name = name
	cn.mu.Unlock()

	c.mu.Lock()
	r.pending--
	r.sockets[cn.socket] = struct{}{}
	c.mu.Unlock()

	if !cn.socket.IsOpen() {
		cn.mu.Lock()
		cn.phase = "closed"
		cn.mu.Unlock()
		c.dropSocket(name, r, cn.socket)
		return
	}

	// Encode the initial state and decide the seed grant under docMu (so this room's heavy encode doesn't
	// stall other rooms), taking c.mu INSIDE it only for the tiny seeder check. Holding docMu across the
	// c.mu section freezes the doc's emptiness, and c.mu serialises the decision, so exactly one live
	// connection per still-empty room wins the grant — concurrent admissions can never both seed.
	r.docMu.Lock()
	state := ycrdt.EncodeStateAsUpdate(r.doc, nil)
	empty := docIsEmpty(r.doc)
	grantSeed := false
	c.mu.Lock()
	if r.seeder == nil && empty {
		r.seeder = cn.socket
		grantSeed = true
	}
	c.mu.Unlock()
	r.docMu.Unlock()
	cn.socket.Send(controlFrame(string(role)))
	if grantSeed {
		cn.socket.Send(controlFrame(seedGrantMessage))
	}
	cn.socket.Send(docFrame(state))

	cn.mu.Lock()
	if cn.phase != "pending" {
		// The handshake reaper (or a client close) finished this connection while we were admitting it;
		// OnClose handles teardown, so don't flip it back to open or replay its buffered frames.
		cn.mu.Unlock()
		return
	}
	cn.phase = "open"
	pending := cn.pending
	cn.pending = nil
	cn.pendingBytes = 0
	cn.mu.Unlock()
	for _, data := range pending {
		cn.handle(data)
	}
}

// dropSocket removes a departing socket from its room. If the departing connection held the seed grant
// while the room is still empty, the grant moves to a surviving peer (a seeder that dies before seeding
// must not leave the room permanently unseedable); the last socket out flushes and forgets the room.
func (c *Core) dropSocket(name string, r *room, socket Socket) {
	var regrant Socket
	// docMu OUTER (the seed re-grant consults doc emptiness), c.mu INNER for the registry/membership fields.
	r.docMu.Lock()
	c.mu.Lock()
	delete(r.sockets, socket)
	if r.seeder == socket {
		r.seeder = nil
		if docIsEmpty(r.doc) {
			for peer := range r.sockets {
				r.seeder = peer
				regrant = peer
				break
			}
		}
	}
	empty := len(r.sockets) == 0 && r.pending == 0
	c.mu.Unlock()
	r.docMu.Unlock()
	if regrant != nil {
		regrant.Send(controlFrame(seedGrantMessage))
	}
	if !empty {
		return
	}
	// Flush BEFORE forgetting the room, while it is still registered — a joiner arriving mid-flush lands
	// on this same live room instead of loading a stale snapshot from the store. The emptiness decision is
	// then re-taken in the same critical section as the registry delete: if a joiner arrived (registered
	// or pending) since the check above, the room stays.
	c.flush(name, r)
	c.mu.Lock()
	if len(r.sockets) == 0 && r.pending == 0 && c.rooms[name] == r {
		delete(c.rooms, name)
	}
	c.mu.Unlock()
}

func (cn *conn) closedNow() bool {
	cn.mu.Lock()
	defer cn.mu.Unlock()
	return cn.phase == "closed"
}

func (cn *conn) startAuthFromFrame(frame []byte, req *Request) {
	if len(frame) == 0 || frame[0] != tagAuth {
		cn.mu.Lock()
		cn.pending = append(cn.pending, frame)
		cn.pendingBytes += len(frame)
		cn.mu.Unlock()
		return
	}
	authed := *req
	authed.AuthToken = string(frame[1:])
	cn.admit(context.Background(), &authed)
}

func (cn *conn) handle(frame []byte) {
	c := cn.core
	if len(frame) == 0 {
		return
	}
	if !cn.bucket.allow(len(frame)) {
		cn.reject(closePolicy, "rate limit exceeded")
		return
	}
	tag := frame[0]
	if tag != tagDoc && tag != tagAware {
		cn.throttledLog("relay: dropped frame with unknown tag %d in room %q", int(tag), cn.roomNameSnapshot())
		return
	}

	cn.mu.Lock()
	r := cn.room
	name := cn.name
	role := cn.role
	cn.mu.Unlock()

	if tag == tagDoc {
		if !CanWrite(role) {
			cn.throttledLog("relay: dropped doc edit from viewer in room %q", name)
			return
		}
		// The CRDT apply — the heavy per-edit work — runs under the per-room docMu, NOT the global c.mu, so
		// a big update in one room no longer serialises every other room.
		r.docMu.Lock()
		err := applyUpdateGuarded(r.doc, frame[1:])
		r.docMu.Unlock()
		if err != nil {
			// A peer can stream malformed DOC frames within its rate budget; throttle like the other
			// per-connection drop logs so it can't flood the log (the frame is still dropped, fail-loud).
			cn.throttledLog("relay: malformed doc update in room %q — %v", name, err)
			return
		}
		c.mu.Lock()
		if r.saveTimer != nil {
			r.saveTimer.Stop()
		}
		r.saveTimer = time.AfterFunc(saveDebounce, func() {
			c.mu.Lock()
			r.saveTimer = nil
			c.mu.Unlock()
			c.safeSave(name, r)
		})
		c.mu.Unlock()
	}

	c.mu.Lock()
	peers := make([]Socket, 0, len(r.sockets))
	for peer := range r.sockets {
		if peer != cn.socket {
			peers = append(peers, peer)
		}
	}
	c.mu.Unlock()
	for _, peer := range peers {
		if peer.IsOpen() {
			peer.Send(frame)
		}
	}
}

func (cn *conn) roomNameSnapshot() string {
	cn.mu.Lock()
	defer cn.mu.Unlock()
	return cn.name
}

func (cn *conn) throttledLog(format string, args ...any) {
	cn.mu.Lock()
	now := cn.core.now()
	if now.Sub(cn.lastViewerDropLog) < viewerDropLogEvery {
		cn.mu.Unlock()
		return
	}
	cn.lastViewerDropLog = now
	cn.mu.Unlock()
	cn.core.log.Printf(format, args...)
}

func (cn *conn) reject(code int, reason string) {
	cn.core.log.Printf("relay: rejected connection (%s)", reason)
	cn.mu.Lock()
	cn.phase = "closed"
	cn.mu.Unlock()
	cn.socket.Close(code, reason)
}
