package relay

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	ycrdt "github.com/skyterra/y-crdt"
)

// fakeSocket is an in-process Socket for driving Core directly — no network, so the concurrency tests
// below can hammer the admission/teardown paths deterministically under -race.
type fakeSocket struct {
	mu        sync.Mutex
	open      bool
	sent      [][]byte
	onMessage func(data []byte)
	onClose   func()
}

func newFakeSocket() *fakeSocket { return &fakeSocket{open: true} }

func (s *fakeSocket) Send(data []byte) {
	s.mu.Lock()
	s.sent = append(s.sent, data)
	s.mu.Unlock()
}

func (s *fakeSocket) Close(int, string) {
	s.mu.Lock()
	s.open = false
	s.mu.Unlock()
}

func (s *fakeSocket) IsOpen() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.open
}

func (s *fakeSocket) OnMessage(listener func(data []byte)) {
	s.mu.Lock()
	s.onMessage = listener
	s.mu.Unlock()
}

func (s *fakeSocket) OnClose(listener func()) {
	s.mu.Lock()
	s.onClose = listener
	s.mu.Unlock()
}

// deliver dispatches a frame as the transport would. Connect registers the listener as its first action
// on its own goroutine, so a frame arriving before registration briefly spins — the same "no frame is
// dispatched before the listener exists" guarantee the real transports give via their ready gates.
func (s *fakeSocket) deliver(data []byte) {
	for {
		s.mu.Lock()
		onMessage := s.onMessage
		s.mu.Unlock()
		if onMessage != nil {
			onMessage(data)
			return
		}
		time.Sleep(time.Microsecond)
	}
}

func (s *fakeSocket) drop() {
	s.mu.Lock()
	s.open = false
	onClose := s.onClose
	s.mu.Unlock()
	onClose()
}

func (s *fakeSocket) frames() [][]byte {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([][]byte, len(s.sent))
	copy(out, s.sent)
	return out
}

// waitAdmitted blocks until the admission DOC frame arrived (the last admission frame), so the caller
// knows the connection is fully open.
func (s *fakeSocket) waitAdmitted(t *testing.T) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, f := range s.frames() {
			if len(f) > 0 && f[0] == tagDoc {
				return
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("connection was never admitted (no DOC frame)")
}

// waitClosed blocks until the socket has been closed by the Core (open flips false), or fails.
func (s *fakeSocket) waitClosed(t *testing.T, why string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if !s.IsOpen() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal(why)
}

// TestPreAuthBufferBoundedByBytes proves an unauthenticated peer can't pin unbounded memory: the pre-auth
// buffer is capped by TOTAL BYTES, not just frame count, so a few maximal frames get the connection dropped.
func TestPreAuthBufferBoundedByBytes(t *testing.T) {
	// AuthRequired keeps the connection in the pending phase; the reaper is disabled so only the byte cap
	// can end this connection.
	core := New(Options{AuthRequired: true, Logger: quietLogger{}, AuthHandshakeTimeout: -1})
	s := newFakeSocket()
	go core.Connect(s, &Request{URL: "/room"})

	frame := make([]byte, 4<<20) // 4 MiB, first byte 0 (tagAware) so it's buffered, not treated as AUTH
	s.deliver(frame)             // 4 MiB pending
	s.deliver(frame)             // 8 MiB pending — at maxPendingBytes
	if !s.IsOpen() {
		t.Fatal("connection dropped before the pre-auth byte budget was exceeded")
	}
	s.deliver(frame) // would push past 8 MiB → dropped
	if s.IsOpen() {
		t.Fatal("connection stayed open after exceeding the pre-auth byte budget")
	}
	s.drop() // let the blocked Connect goroutine return
}

// TestUnauthenticatedConnectionIsReaped proves a peer that connects but never sends an AUTH frame is
// dropped after the handshake timeout instead of holding its goroutines and socket slot forever.
func TestUnauthenticatedConnectionIsReaped(t *testing.T) {
	core := New(Options{AuthRequired: true, Logger: quietLogger{}, AuthHandshakeTimeout: 30 * time.Millisecond})
	s := newFakeSocket()
	go core.Connect(s, &Request{URL: "/room"})

	s.waitClosed(t, "an unauthenticated connection was not reaped after the handshake timeout")
	s.drop()
}

type quietLogger struct{}

func (quietLogger) Printf(string, ...any) {}

func testDocUpdate(text string) []byte {
	doc := ycrdt.NewDoc("t", false, nil, nil, false)
	ytext := doc.GetText("source")
	doc.Transact(func(*ycrdt.Transaction) {
		ytext.Insert(0, text, nil)
	}, nil)
	return ycrdt.EncodeStateAsUpdate(doc, nil)
}

// countingStore counts loads so the leave/join race test can prove the room was reloaded (or not).
type countingStore struct {
	mu    sync.Mutex
	data  map[string][]byte
	loads int
}

func (s *countingStore) Load(room string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loads++
	return s.data[room], nil
}

func (s *countingStore) Save(room string, snapshot []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data == nil {
		s.data = map[string][]byte{}
	}
	s.data[room] = snapshot
	return nil
}

func docText(doc *ycrdt.Doc) string {
	return doc.GetText("source").ToString()
}

// connect runs Core.Connect on its own goroutine (as every transport does) and returns the socket.
func connect(c *Core, room string) *fakeSocket {
	s := newFakeSocket()
	go c.Connect(s, &Request{URL: "/" + room})
	return s
}

// TestLeaveJoinChurnNeverForksTheDoc hammers the exact window dropSocket used to get wrong: the last
// socket leaving a room concurrently with a fresh joiner. Under the old two-critical-section teardown the
// joiner could land on a room that was then deleted from the registry (a ghost room), forking the
// document. After the churn, one more joiner must still see the full edit history. Run with -race.
func TestLeaveJoinChurnNeverForksTheDoc(t *testing.T) {
	core := New(Options{Store: &countingStore{}, Logger: quietLogger{}})

	seeder := connect(core, "churn")
	seeder.waitAdmitted(t)
	seeder.deliver(docFrame(testDocUpdate("the seed edit")))

	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s := connect(core, "churn")
			s.waitAdmitted(t)
			s.deliver(docFrame(testDocUpdate(fmt.Sprintf("edit %d", i))))
			s.drop()
		}(i)
	}
	wg.Wait()
	seeder.drop()

	late := connect(core, "churn")
	late.waitAdmitted(t)
	var initial []byte
	for _, f := range late.frames() {
		if len(f) > 0 && f[0] == tagDoc {
			initial = f[1:]
			break
		}
	}
	doc := ycrdt.NewDoc("check", false, nil, nil, false)
	if err := applyUpdateGuarded(doc, initial); err != nil {
		t.Fatalf("late joiner's initial state is corrupt: %v", err)
	}
	text := docText(doc)
	if !strings.Contains(text, "the seed edit") {
		t.Fatalf("late joiner lost the seed edit — the doc forked; got %q", text)
	}
	late.drop()
}

// TestPendingReplayRacesLiveFramesWithoutDataRace exercises the auth-off replay window: frames delivered
// while the connection is still "pending" are buffered and replayed by admit on the Connect goroutine,
// while the transport keeps dispatching fresh frames concurrently — both paths debit the same rate
// bucket. Run with -race: the unsynchronized bucket made this a genuine data race.
func TestPendingReplayRacesLiveFramesWithoutDataRace(t *testing.T) {
	core := New(Options{Store: &countingStore{}, Logger: quietLogger{}})

	for round := 0; round < 25; round++ {
		room := fmt.Sprintf("replay-%d", round)
		a := connect(core, room)
		// Blast frames immediately — some land in the pending buffer (replayed by admit), some race in
		// live after the phase flips to open.
		var wg sync.WaitGroup
		for g := 0; g < 2; g++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				update := testDocUpdate("racing edit")
				for i := 0; i < 20; i++ {
					a.deliver(docFrame(update))
				}
			}()
		}
		wg.Wait()
		a.waitAdmitted(t)
		a.drop()
	}
}

// TestLoadErrorNeverSeedsAnEmptyRoom pins the safeLoad fix: a transient Store.Load failure must fail the
// admission (so the debounced save can't overwrite the good stored snapshot with a freshly-seeded empty
// room), never silently produce an empty doc.
func TestLoadErrorNeverSeedsAnEmptyRoom(t *testing.T) {
	failing := &flakyStore{err: fmt.Errorf("disk on fire")}
	core := New(Options{Store: failing, Logger: quietLogger{}})

	s := connect(core, "fragile")
	deadline := time.Now().Add(2 * time.Second)
	for s.IsOpen() && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if s.IsOpen() {
		t.Fatal("connection was admitted despite a store load failure")
	}
	for _, f := range s.frames() {
		if len(f) > 0 && f[0] == tagDoc {
			t.Fatal("an initial DOC frame was sent despite a store load failure")
		}
	}

	// After the store recovers, the same room admits normally with the real snapshot.
	failing.setErr(nil)
	if err := failing.Save("fragile", testDocUpdate("the stored truth")); err != nil {
		t.Fatalf("save: %v", err)
	}
	ok := connect(core, "fragile")
	ok.waitAdmitted(t)
	var initial []byte
	for _, f := range ok.frames() {
		if len(f) > 0 && f[0] == tagDoc {
			initial = f[1:]
			break
		}
	}
	doc := ycrdt.NewDoc("check", false, nil, nil, false)
	if err := applyUpdateGuarded(doc, initial); err != nil {
		t.Fatalf("initial state corrupt: %v", err)
	}
	if text := docText(doc); !strings.Contains(text, "the stored truth") {
		t.Fatalf("recovered room lost the stored snapshot; got %q", text)
	}
	ok.drop()
}

type flakyStore struct {
	mu   sync.Mutex
	err  error
	data map[string][]byte
}

func (s *flakyStore) setErr(err error) {
	s.mu.Lock()
	s.err = err
	s.mu.Unlock()
}

func (s *flakyStore) Load(room string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return nil, s.err
	}
	return s.data[room], nil
}

func (s *flakyStore) Save(room string, snapshot []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return s.err
	}
	if s.data == nil {
		s.data = map[string][]byte{}
	}
	s.data[room] = snapshot
	return nil
}
