# @m/collab — work log

- Added a server-side static membership source (`server/membership.mjs`). `MEMBERSHIP_FILE` points the
  relay at a strict JSON `{ rooms: { room: { subject: role } } }` file, loaded at startup; malformed
  files throw loudly, auth-on deployments fail closed for missing rooms/subjects, tenant isolation still
  applies, and auth-off dev can keep an explicit editor default. Integration tests cover decoding,
  invalid roles, tenant denial, default-role posture, and file loading.
- Wired the browser Auth0 side of Phase 2 in the app: an env-gated Authorization Code + PKCE client
  obtains an access token, stores it only for the browser session, sends it as the first WebSocket auth
  frame, and derives collaborative presence name/colour from token claims. Focused app integration tests
  cover config gating, PKCE login URL construction, callback code exchange, callback URL cleanup, token
  storage, and identity extraction.
- Moved WebSocket auth tokens out of relay URLs: `connectTransport` now sends `TransportHooks.authToken`
  as tag 3 before document/presence frames, and auth-enabled relays wait for that auth frame before
  admitting a socket. Unit/integration tests prove the auth frame order and that URL query tokens are no
  longer consumed.
- Added `createIndexedDbRoomStore(indexedDB)`, an async browser `RoomStore` implementation that stores
  whole Yjs room snapshots as binary IndexedDB values. This gives backend-free browser runtimes a real
  embedded database behind the same snapshot seam, without introducing a package dependency.
- Added a browser-compatible `RoomStore` shell contract with memory and Web Storage implementations.
  The Web Storage store persists whole Yjs room snapshots as binary data, encoded per room, so a
  backend-free browser build can use the same snapshot seam as the relay instead of app-only overlay
  persistence.
- Added `initialUpdate` hydration to `createCollabSession`: a stored Yjs room snapshot wins over
  source/overlay seeds and materialises through the same overlay decoder. Unit coverage proves a saved
  snapshot hydrates a fresh session.
- Aligned the Node relay stores with the browser `RoomStore` semantics: the server memory store now
  copies snapshots on save/load, and the relay uses the `createMemoryRoomStore` /
  `createFileRoomStore` names while keeping the old constructor aliases for compatibility.
- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- Pinned `yjs` 13.6.31 in the catalog (latest stable, ~22d old — passes the ≥24h supply-chain rule).
- Built `createCollabSession` (`src/shell/session.ts`): one `Y.Doc` holding the source (`Y.Text`) and
  the overlay (overrides + groups, two `Y.Map`s). Its `overlay` implements the `@m/contracts`
  `OverlayDoc` port by reusing `@m/builder`'s pure overlay ops, writing minimal diffs into the Y.Maps,
  and materialising branded state back through `@m/builder`'s Zod `decodeOverlay` (peer data validated
  at the boundary, never trusted raw; a decode failure throws loudly). Undo/redo is a `Y.UndoManager`
  scoped to local edits; `record()` maps to `stopCapturing()` so a gesture is one undo step.
  Transaction origins (`LOCAL`/`REMOTE`/`SEED`) keep undo tracking, broadcast-without-echo, and the
  un-historied initial seed straight. Source channel + binary-sync seam (`state`/`applyUpdate`/
  `onUpdate`) and remote-change listeners exposed.
- Tests (23, green): unit overlay + undo/redo + source; integration two-peer convergence incl. a
  fast-check property that any interleaving of independent moves converges. Coverage ratchet set in
  `vitest.config.ts` (~97% stmts).
- Wired into the DAG (`builder <- collab <- app`): root `Makefile` MODULES + graph, `AGENTS.md` §4,
  root `PLAN.md`. Moved the `OverlayDoc` interface into `@m/contracts` so the local (app) and Yjs
  (collab) implementations share one port. The app constructs the Yjs `overlay` behind a default-off
  `?collab` flag.
- Dev WebSocket transport. Added `connectTransport(session, socket)` over a `CollabSocket` abstraction
  (send state on open, applyUpdate on message, forward local updates) + `webSocketTransport(url)` using
  the platform `WebSocket`. `dev-server.mjs` is a server-authoritative relay (rooms by URL path,
  per-room `Y.Doc`, full state on join + broadcast to others); `make collab-server` runs it. Pinned
  `ws` 8.21.0 (server only; the client uses the global `WebSocket`). Tests: transport wiring over
  in-memory paired sockets + a mocked-`WebSocket` `webSocketTransport` (unit, deterministic); the real
  relay + socket path is covered end-to-end by the app's Playwright two-tab spec. The app `?collab` flag
  now connects to the relay and repaints on remote overlay changes; two new Playwright specs cover the
  single-tab Yjs path and two-tab live convergence (relay added as a second Playwright webServer).
  Added `@m/collab` to the base tsconfig paths. The relay URL scheme is page-derived (`wss` on https,
  plain only for local dev) so a deployed instance never opens an insecure socket.
- Live source-text binding. Added `CollabSession.sourceBinding()` — a y-codemirror.next `yCollab(yText,
  null)` CodeMirror extension that two-way-binds the editor to the source `Y.Text` (character-level
  merge, per-user text undo via Yjs). The `Y.Text` stays encapsulated; only an opaque CM extension
  crosses the boundary. The app's `createEditor` gained an `extra` extensions hook + a `textHistory`
  flag (collab mode drops CodeMirror's own history so the two undo stacks don't fight ⌘Z); in collab
  mode the editor starts empty and a seed-if-empty (after sync) fills the first client's room, later
  joiners adopt it. A text edit no longer clears the shared overlay in collab mode (stale overrides are
  inert). Pinned `y-codemirror.next` 0.3.5 + `@codemirror/state`/`@codemirror/view` deps. A new
  Playwright spec proves two tabs share the diagram text live (edit in A → B's editor + canvas follow);
  the module's 30 tests + 108 Playwright specs are green.
- Presence (awareness). Added a y-protocols `Awareness` to the session: `setLocalUser(name/color)`,
  `awarenessState()`/`applyAwarenessUpdate()`/`onAwarenessUpdate()`, and `sourceBinding()` now passes
  the awareness to `yCollab` so remote carets/selections render (the binding tracks the local cursor
  into awareness). Document and presence ride the same socket as distinct **tagged frames** (byte 0 =
  doc, 1 = awareness): `connectTransport` sends/routes both, and the dev relay applies doc frames to the
  room `Y.Doc` (for late-join) but only relays presence (ephemeral). Pinned `y-protocols` 1.0.7. Tests:
  presence-frame routing + setLocalUser round-trip (unit); a Playwright spec proves a remote cursor from
  one tab shows in the other. Phase 1 is now feature-complete (32 module tests + 109 Playwright green).
- Phase 2 start — durable persistence + auth seam (server is optional; single-user local untouched).
  Evolved the dev relay into `server/relay.mjs` + a pluggable `server/store.mjs` (`RoomStore`:
  `createMemoryStore` + `createFileStore`). The relay loads a room's snapshot on first join and saves
  it (debounced, flushed on room close), so rooms survive a restart; `PERSIST_DIR` selects the file
  store (default in-memory, zero-config). `startRelay({ store, authorize })` is injectable; every
  connection passes an `authorize(req)` hook (default allow) — the Auth0 OIDC seam. Updated the Makefile
  target + Playwright webServer to `server/relay.mjs`. Tests: a `.mjs` store round-trip incl.
  fresh-instance-over-same-dir (≈ restart) and path-safe room filenames; the relay's end-to-end restart
  survival was verified manually (a client wrote text, the relay restarted on the same dir, a new client
  read it back). Production `RoomStore` (Postgres update log + S3 snapshots) is the same interface.
- Phase 2 — Auth0 OIDC handshake (extending our own relay, not Hocuspocus; §10.5 reconsidered).
  `server/auth.mjs`: `createVerifier({jwksUri,issuer,audience})` + `createAuth0Authorizer({domain,audience})`
  verify the connection's first auth frame against the issuer JWKS via `jose` — signature + issuer +
  audience + expiry — returning `{ok,user}` or a reason. The relay's connection handler is now async: it
  buffers frames during verification, then admits (sends state) or closes 1008. Auth is env-gated
  (`AUTH0_DOMAIN`/`AUTH0_AUDIENCE`); default allow-all, so dev/e2e stay zero-auth. The app forwards the
  browser Auth0 access token as the first auth frame when present. Pinned `jose` 6.2.3.
  Test: a local JWKS harness (generated RSA key + a local endpoint + signed tokens) covering accept +
  every rejection; the relay admit/reject + buffering flow verified manually.
- Phase 2 — rooms + RBAC (server-enforced). The verifier now surfaces `tenant` (Auth0 `org_id`) + per-
  room `roles` (a namespaced claim) on the user. `server/rbac.mjs` `createClaimsRoleResolver` returns
  `authorizeRoom({user,room}) -> owner|editor|viewer|null`: tenant isolation (a tenant-bound user reaches
  only rooms namespaced `<tenant>/…`) + per-room role from claims (authoritative when present; default
  editor when no claim; null = deny). The relay closes 1008 on no access and enforces viewers read-only
  (inbound DOC frames dropped; presence still relays); `authorizeRoom` is injectable and defaults to the
  claims resolver, which grants editor to an unauthenticated user so dev/e2e are unaffected. Tests
  (`rbac.test.mjs`, 8): role resolution, deny, tenant isolation, `canWrite`; verifier-surfaces-claims in
  `auth.test.mjs`. Relay enforcement (viewer-drop / editor-relay / deny-close-1008) verified manually.
- Phase 2 — role-aware client. Added a server→client CONTROL frame (transport tag 2) carrying the
  granted role; `connectTransport`/`connectWebSocket` gained an `onControl` hook (`TransportHooks`), and
  the relay sends the role on admit (before the doc state). The app applies it: a viewer's editor +
  canvas go read-only (CodeMirror editability compartment via a new `editor.setReadOnly`; drag / resize
  / delete / nudge / rename guarded by a `viewerMode` flag; the `.editor-tools` dimmed via a
  `body[data-role]` attribute) with a "view only" badge; editor/owner restore editing. Tests: control-
  frame routing (unit); a Playwright spec drives the role via a `__collabSetRole` hook → editor
  read-only + badge + body role, then back to editable (screenshot-verified). The relay's actual role
  control frame was verified manually. The server remains the security boundary; this is the matching UX.
- Audit sweep fixes. Server (`relay.mjs`): WebSocket `maxPayload` cap + bounded pre-auth frame buffer
  + room cap (DoS hardening); store IO wrapped in try/catch so a save failure in the debounce timer is
  logged loudly, not a process crash (fail-loudly); a close-during-async-auth reconciliation so a dead
  socket can't keep an empty room alive. `store.mjs`: atomic file write (temp + rename). Session
  (`session.ts`): `destroy()` now unobserves the Y observers + `doc.off("update")` + clears the listener
  Sets (was leaking on teardown); added atomic `seedSourceIfEmpty` (removes the seed check-then-set
  race within a client). Transport (`transport.ts`): a `TransportHooks.onClose` so a dropped relay is
  surfaced, not a silent desync. Tests: a relay integration test (viewer write dropped, editor relayed,
  forbidden/bad-token → 1008, role frame announced); `seedSourceIfEmpty` + `onClose` unit tests.
- Polish pass (audit follow-up). RBAC: the permissive no-roles-claim default is now an explicit
  `createClaimsRoleResolver({ defaultRole })` knob (default `editor`; production passes `null` to fail
  closed) — resolving the silent fail-open the audit flagged (+ a fail-closed test). Verified and
  withdrew the audit's printer-round-trip finding: the parser rejects empty/delimiter labels, so no
  parser-produced AST can trigger it (recorded in @m/parser BUGS).
- Polish/harden: dropped `session.ts`'s hand-written `encodeOverride`/`encodeGroup`; it now encodes
  Y.Map entries through `@m/builder`'s shared `encodeOverrideEntry`/`encodeGroupEntry` (the same encoders
  JSON persistence uses), so the wire shapes can't drift and a new `NodeOverride`/`Group` field is a
  compile error at the encoder's `satisfies` guard rather than a silent wire-drop. Resolves the audit's
  hand-written-encoder finding.
- Implemented `OverlayDoc.replaceOverrides` for the Yjs-backed overlay by clearing and repopulating the
  override map in one local transaction. This keeps collab mode aligned with the app's pinned-regenerate
  behavior.
- Hardening sweep (relay + transport + session). Relay (`server/relay.mjs`): wrapped `applyUpdate` in a
  try/catch (a malformed CRDT frame is logged + dropped before re-broadcast, not an `uncaughtException`
  that crashes every room); registered `socket.on("error")` + `wss.on("error")` so transport faults
  can't reach `uncaughtException`; added a per-socket token-bucket rate limit on frames/sec AND bytes/sec
  (injectable `rateLimit` knob, `now` injectable) closing 1008 on breach across all post-auth frames;
  added a frame-tag allow-list (`DOC`/`AWARE` only — unknown + inbound `CONTROL` dropped, one throttled
  warn); validate the URL-derived room name once at the boundary (`<tenant>/<id>` grammar; empty/`.`/`..`
  />2-segment → 1008, no normalisation); throttled the viewer-edit-dropped warn; the run-block flushes
  every dirty room on SIGINT/SIGTERM (`wss.flushAll()`). RBAC (`server/rbac.mjs`): `createClaimsRoleResolver`
  now defaults `defaultRole: null` (fail closed); the relay's run-block passes
  `defaultRole: authEnabled ? null : "editor"` (auth on → deny role-less tokens; auth off → dev editor).
  Transport (`src/shell/transport.ts`): added `reconnectingWebSocketTransport(url, deps)` — a self-healing
  `CollabSocket` that mints a fresh inner WebSocket on drop, re-binds all listeners, backs off
  (exponential + jitter + cap, injected `schedule`/`random`), re-fires `onOpen` on reopen so the state
  exchange re-runs, fires the consumer `onClose` only when the budget is exhausted, and surfaces a
  closed-union `ReconnectStatus`. Session (`src/shell/session.ts`): `materialize` returns the decode
  `Result` (no throw in the observer); the observer logs via a new `Logger<CollabEvent>`
  (`"overlay-decode-rejected"`, threaded through `createCollabSession({ logger })`), surfaces a
  `CollabStatus` (`onStatusChange`), and keeps last-good on the rejected branch; `groupNodes` mints
  `g${clientID}-${seq}` (collision-proof across collaborators). Tests (+42, 74 total green): backoff
  schedule, reconnect re-mint + re-exchange + budget-exhaust + user-close, corrupt-remote-overlay path,
  two-client concurrent grouping survival, `replaceOverrides`, and relay crash-guard / room-name /
  tag-allow-list / rate-limit integration. RBAC tests updated for the fail-closed default.
