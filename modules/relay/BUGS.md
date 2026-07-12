# @m/relay — bugs

No high-severity open bugs. Of the 2026-07-12 security scan's lower-severity items, the save-`.tmp` race, the
malformed-frame log spam, and the cross-room lock contention are now fixed (below); the one left open (written
up in `DO_NEXT.md`) is the same-host origin scheme/port allowance — assessed and intentionally left, since
there's no reliable request-scheme signal behind a TLS proxy and `ALLOWED_ORIGINS` is the real control. The
module shipped with real bugs before, too — the earlier "no known open bugs" claim was true only until a
review actually went looking. Recorded below so the history stays honest.

Resolved (security scan, found + fixed 2026-07-12):

- ~~**An unauthenticated peer could pin ~256 MiB pre-auth.**~~ The pre-auth buffer was capped by frame
  COUNT (`maxPendingFrames = 64`) while each frame is up to 4 MiB, so 64 maximal non-AUTH frames pinned
  ~256 MiB before any token. Fixed: bound the buffer by TOTAL BYTES (`maxPendingBytes = 8 MiB`, tracked in
  `conn.pendingBytes`); the flood check trips on bytes as well as count. `-race` test.
- ~~**A connection that opened but never authenticated lived forever.**~~ With `AuthRequired`, a peer could
  connect and simply never send an AUTH frame, holding its read/write goroutines and socket slot with no
  timeout anywhere. Fixed: an auth-handshake reaper (`defaultAuthHandshakeTimeout` 10s, injectable via
  `Options.AuthHandshakeTimeout`) drops a still-pending connection; `admit` guards the open transition
  against it. Also set `http.Server.ReadHeaderTimeout`/`IdleTimeout` for the pre-upgrade HTTP phase. `-race`
  test.
- ~~**`File.Save` shared a fixed `<room>.tmp` path across concurrent saves.**~~ A fired debounce racing a
  last-leave/shutdown flush for the same room both wrote the same temp then renamed — a torn file or a
  rename ENOENT (a lost/degraded snapshot). Fixed: a per-save unique temp via `os.CreateTemp` (0644 preserved,
  cleaned up on failure), so the survivor is always one complete write. `-race` concurrency test.
- ~~**Malformed DOC-update logging was unthrottled.**~~ A peer streaming corrupt DOC frames (within its rate
  budget) logged one line each. Fixed: routed through the per-connection `throttledLog` like the other
  drop-logs; the frame is still dropped (fail-loud), just not spammed.
- ~~**The global `Core.mu` was held across the CRDT apply/encode → cross-room head-of-line blocking.**~~ One
  room's large `ApplyUpdate`/`EncodeStateAsUpdate` (payloads up to 4 MiB) stalled admissions/broadcasts/saves
  for EVERY room. Fixed: a per-room `room.docMu` guards the CRDT contents while `Core.mu` keeps only the cheap
  registry/membership/metadata; the heavy CRDT work no longer serialises the whole server. Lock order docMu →
  Core.mu (the seed decision and `dropSocket` need both); the churn/seed `-race` tests (40 goroutines editing
  while joining/leaving) pass at `-count=30`, proving the split kept the no-fork / one-seeder invariants.

Resolved (review sweep, found + fixed 2026-07-10):

- ~~**The 32KiB default read limit killed any DOC frame bigger than that.**~~ No `SetReadLimit` was set
  after `websocket.Accept`, so coder/websocket's 32KiB default closed the connection with 1009 on any
  legitimately large document snapshot (reproduced). Fixed: `maxFrameBytes` (4MiB, matching the rate
  limiter's per-second byte bucket) in `cmd/relay-server/socket.go`, with a relayed-110KB-frame test.
- ~~**A transient `Store.Load` failure silently seeded an empty room.**~~ `safeLoad` swallowed the error
  and returned `(nil, nil)`, so the room came up empty and the next debounced save overwrote the good
  stored snapshot with nothing. Fixed: `loadRoom` propagates the load error and the admission closes
  1011 "room load error"; `TestLoadErrorNeverSeedsAnEmptyRoom` pins both the rejection and the recovery.
- ~~**Last-leave/first-join race could fork a room's doc.**~~ `dropSocket` computed emptiness in one
  critical section but deleted the room from the registry in a later one; a joiner admitted in between
  was left on a ghost room while the next joiner loaded a fresh doc for the same name. Fixed: the room
  now carries a pending-admission counter (reserved in `loadRoom` under the same lock as the registry
  lookup, released at socket registration), the flush runs while the room is still registered, and the
  registry delete re-checks sockets+pending in its own critical section. `TestLeaveJoinChurnNeverForksTheDoc`
  hammers the window under `-race`.
- ~~**Data race on the rate bucket during the auth-off pending-frame replay.**~~ `admit` replays buffered
  frames on the Connect goroutine while the read loop dispatches fresh frames concurrently — both debit
  the same unsynchronized `rateBucket`. Fixed with a mutex inside the bucket;
  `TestPendingReplayRacesLiveFramesWithoutDataRace` reproduces the race (verified: it fails under `-race`
  with the mutex removed).
- ~~**One stuck peer stalled every sender; send failures were log-and-continue.**~~ Broadcast wrote to
  peers synchronously and sequentially with a 10s timeout per frame, so a single non-reading peer could
  stall the whole room, and a failed write left the peer half-alive. Fixed: per-peer bounded outbound
  queues drained by a writer goroutine — queue overflow or a write error/timeout closes that peer loudly
  (`cmd/relay-server/socket.go`), covered by `TestSlowConsumerIsClosedWithoutStallingSenders`.
- ~~**Malformed `PORT` silently fell back to the default.**~~ `envInt` returned the default on a parse
  error; now it exits with a clear message (fail loudly).
- ~~**Shutdown flushed before closing hijacked WebSocket conns.**~~ `FlushAll` ran while connections were
  still live (and `http.Server.Shutdown` never waits for hijacked conns), so an edit inside the 400ms
  save-debounce window at SIGTERM could be dropped. Fixed: a socket registry drains (closes + waits for)
  every live connection — whose last-out teardown flushes each room — before the final `FlushAll`.
- ~~**`cmd/relay-wasm`'s `jsSocket.Close` was a no-op teardown.**~~ It flipped `open` but never fired the
  registered close listener nor told JS: a rejected connection leaked a goroutine blocked in
  `Core.Connect`, stayed in the room's socket set, and the client believed it was connected. Fixed:
  `Close` now drives the full close path and the `mermolluscRelayConnect` contract gained an
  `onClosed(code, reason)` callback (wired through `modules/collab`'s `wasm-relay.ts` so the client's
  close listeners fire). `TestCloseDrivesTeardownAndNotifiesJS` covers the rejection path.
- ~~**The WASM test suite was red on main and ran nowhere.**~~ `TestConnectAdmissionSendsControlThenDoc`
  still expected the pre-seed-grant admission sequence ([CONTROL role, DOC]) after the relay started
  sending [CONTROL role, CONTROL "seed", DOC], and nothing ran `make test-wasm` (the `js && wasm` build
  tag silently excludes it from every native `go test`). Fixed the test to the real protocol and wired
  `test-wasm` into this module's `test` (and therefore `check`) target — it runs under Go's own
  Node-based `go_js_wasm_exec`, no browser needed.
- ~~**SECURITY: `InsecureSkipVerify: true` accepted cross-origin WebSocket upgrades.**~~ With auth off by
  default, any website could drive a local relay from a visitor's browser. Replaced with an explicit
  Origin policy (`cmd/relay-server/server.go`): no-Origin (non-browser) requests, loopback origins, and
  same-hostname origins are allowed, plus an `ALLOWED_ORIGINS` env allowlist; everything else is rejected
  with a logged 403 before the upgrade. Four origin-policy tests.
- ~~**SECURITY hardening: the accepted JWS algorithm set followed the JWKS.**~~ `jwt.Parse` with a key
  set accepts whatever algorithm each key advertises, so a future JWKS entry could widen the set. `auth/`
  now filters the looked-up set to keys explicitly declared RS256 before verification
  (`TestPinsAcceptedAlgorithmToRS256` proves a validly-signed RS512 token is rejected).
- **Doc-accuracy note:** earlier revisions of these docs described `loadRoom`'s first-touch guard as
  "request-coalescing via `pendingLoads`" — no such symbol ever existed. The real mechanism is
  double-checked locking (load outside the lock, re-check the registry under it, discard the losing doc),
  now stated correctly everywhere.

Resolved (caught during the Go port/WASM milestones, fixed before shipping — flagged here because they're
exactly the kind of thing worth remembering when touching this code again):

- **`http.ServeMux`'s implicit path-cleaning silently defeated room-name validation.** `ServeMux`
  auto-redirects a request with repeated slashes or `.`/`..` segments to a "cleaned" URL before any
  handler runs; `websocket.Dial` transparently followed the redirect, so a malformed room path like
  `/a//b` was silently rewritten to `/a/b` — a *valid* room — before `relay.Core`'s own validation ever
  saw it. Caught by the ported `TestRoomNameEmptySegmentCloses1008` test. Fixed by not using `ServeMux` at
  all (`cmd/relay-server/server.go` uses a bare `http.HandlerFunc` and reads `r.RequestURI`, the raw
  unparsed request-target, instead of Go's re-serialised `r.URL.String()`).
- **A data race in the native transport adapter.** `wsSocket.OnMessage`/`OnClose` (called by `Core.Connect`
  to register listeners) and `readLoop`'s dispatch (running in its own goroutine, started concurrently)
  raced on the listener fields with no synchronization — a real bug specific to porting from JS's
  single-threaded event loop to Go's actual concurrency, not something the JS source ever had to guard
  against. Caught by `go test -race`. Fixed with a mutex plus a `ready` gate so `readLoop` never dispatches
  before both listeners are registered (closing a second, quieter gap: a frame arriving in that window
  would otherwise have been silently dropped, not just raced).
- **Concurrent first-touch of a brand-new room could create two divergent `Doc`s.** Making `Store.Load`
  properly awaitable (for a future async store) put real work between the room-registry's "does this room
  exist" check and its "create it" step — a window two real concurrent connections could both fall into,
  each building their own `Doc` for the same room name. Unreachable in the JS original (no `await` inside
  the equivalent check-then-create, so single-threaded execution ran it atomically); reachable under Go's
  real parallelism. Fixed with double-checked locking in `loadRoom`: the store load runs outside the
  mutex, then the registry is re-checked under it — the loser of a concurrent first-touch adopts the
  winner's room and discards its own doc, so one room name can never map to two docs. (Both loaders do
  hit the store; correctness comes from the re-check, not from coalescing the loads.)
- **(Milestone 2) `relay.wasm`/`wasm_exec.js` resolved against the site root instead of the demo's base
  path.** The Pages demo isn't hosted at the domain root (`/mermollusc/demo/`, not `/`); hardcoded
  `/relay.wasm` URLs 404'd. Neither Go-side nor TypeScript-side unit tests could have caught this — it's a
  deployment-path concern. Fixed by resolving both URLs against Vite's `import.meta.env.BASE_URL` in
  `app/playground/src/main.ts`, and only found by actually running the built demo in a real browser.
- **(Milestone 2) WebAssembly compilation was blocked by the app's Content-Security-Policy.** Browsers
  refuse `WebAssembly.instantiate()`/`instantiateStreaming()` under `script-src 'self'` alone — confirmed
  via the actual CSP violation, not assumed. Fixed narrowly: `tools/build-pages.mjs` patches
  `'wasm-unsafe-eval'` (CSP Level 3 — permits *only* WASM compilation, never `eval()`/`Function()` string
  execution) into the *built* demo's `index.html` only; `app/playground/index.html` (every other
  build/deployment of the app) keeps the unmodified, stricter policy.
