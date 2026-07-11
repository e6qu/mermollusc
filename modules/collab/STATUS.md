# @m/collab — status

**State:** Phase 1 feature-complete; **Phase 2 in progress**. The relay itself (persistence, Auth0 OIDC
verification, rooms + RBAC, static membership source) moved out of this module into **`modules/relay`**
(Go, native for production, WebAssembly for the backend-free demo; see that module's own docs). This
module now owns only the browser-side Yjs document/transport, which speaks the same wire protocol to
whichever relay is running. The app runs single-user by default; with `?collab` set it connects to a
relay — a real network one (via `reconnectingWebSocketTransport`) in production/dev, or the same relay
core compiled to WASM and driven in-process (via `connectWasmRelay`) in the backend-free demo — and binds
the editor to the shared doc.

- **What works:** `createCollabSession` wraps a `Y.Doc` (source `Y.Text` + overrides, groups,
  edge-style, and node-style `Y.Map`s). Its `overlay` implements the `OverlayDoc` port (move/resize/
  group/ungroup/lock/label/prune/replace/replaceOverrides/clear + setEdgeStyle/setNodeStyle, undo/redo
  via `Y.UndoManager`, persist via injected `save`). Source channel: `source`/`setSource`/`spliceSource`
  + `onSourceChange`. Binary sync: `state`/`applyUpdate`/`onUpdate`.
- **Visual overlay styles sync:** node colour accents and per-edge route styles live in their own
  `Y.Map`s and propagate to peers exactly like positions/groups do (they used to be per-client session
  memory, so peers silently never saw a restyle). Writes go through `@m/builder`'s shared per-entry wire
  encoders (`encodeEdgeStyleEntry`/`encodeNodeStyleEntry`); reads re-materialise through the same Zod
  overlay decoder as everything else. Styles are in the undo scope and in `replace()`/`persist()`;
  `createCollabSession` accepts optional `initialEdgeStyles`/`initialNodeStyles` seeds.
- **Per-member group merge:** a group is a nested `Y.Map` (`id`/`label`/`locked` + a nested `members`
  `Y.Array`), not one flat LWW value — `label`/`locked` are per-field LWW, `members` merges per-element
  like `Y.Text`. Two peers concurrently editing *different members of the same group* (e.g. each
  dissolving a different child into a shared parent, or each pruning a different dead node from the same
  group) both survive; previously the second write's whole-group `.set()` silently clobbered the first's.
  `groupNodes`/`ungroupAt`/`setGroupLocked`/`setGroupLabel`/`pruneGroupsTo`/`replace` all write through
  targeted per-field/per-member Yjs ops instead of a whole-group re-encode. JSON persistence is
  unaffected (`encodeGroupEntry`/`decodeOverlay` still speak the flat wire shape); `materialize()`
  flattens each nested group back via `.toJSON()`, rejecting (as a decode failure, never a throw) any
  group value that isn't the expected nested `Y.Map` — including a stale pre-redesign flat value, so an
  old persisted room fails loudly on load rather than silently misbehaving. The `yGroups` observer is now
  `observeDeep` (a shallow `observe` can't see edits inside an already-integrated nested type).
- **Transport:** `connectTransport(session, socket)` binds the binary-sync seam to any `CollabSocket`;
  `webSocketTransport(url)`/`connectWebSocket(session, url)` use the platform `WebSocket`.
- **Server:** lives in `modules/relay` now (Go) — room registry, RBAC, rate limiting, frame protocol,
  auth, and persistence. `make collab-server` at the repo root runs it. **Optional** — the app runs fully
  single-user without it. See `modules/relay/PLAN.md`/`STATUS.md` for its design and current state.
- **Browser Auth0 login:** the app has an env-gated Auth0 Authorization Code + PKCE client
  (`VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` / `VITE_AUTH0_AUDIENCE`). A signed-in browser stores the
  access token in session storage, sends it through `TransportHooks.authToken` as the first auth frame,
  and derives presence name/colour from token claims instead of the old random placeholder.
- **Browser room snapshots (`src/shell/store.ts`):** `createMemoryRoomStore`,
  `createWebStorageRoomStore`, and async `createIndexedDbRoomStore` expose the same whole-Yjs-state
  snapshot contract to browser runtimes. `createCollabSession({ initialUpdate })` hydrates from that
  stored snapshot before any source/overlay seed is applied.
- **WASM relay (`src/shell/wasm-relay.ts`):** `loadWasmRelay()` lazily loads `modules/relay`'s
  `cmd/relay-wasm` build (script-inject `wasm_exec.js`, `fetch` + `WebAssembly.instantiateStreaming` the
  `.wasm`, falling back to the buffered `instantiate` path if a static file server doesn't send
  `Content-Type: application/wasm`). A rejected load is NOT cached (the next call retries), and a Go
  runtime crash/exit — previously swallowed by `void go.run(...)` — is logged loudly and closes every
  live wasm-relay socket. `connectWasmRelay({ room, store })` drives it in-process and returns a
  `CollabSocket` fed into the same `connectTransport` the real-relay path uses; it registers the
  `onClosed(code, reason)` callback the Go side now requires, so a relay-side rejection fires the
  socket's close listeners exactly once (client-close and relay-confirm can't double-fire). This is the seam the
  backend-free demo uses to run the *real* relay (RBAC, room registry, persistence via the injected
  `store`) instead of skipping it — verified end-to-end by `app/playground/e2e-pages/
  backend-free-collab.spec.ts` (a genuine CONTROL frame sets the role badge; an override survives reload
  via the relay's own debounced save into IndexedDB; zero real `WebSocket`s ever open).
- **Reconnecting transport (`src/shell/transport.ts`):** `reconnectingWebSocketTransport(url, deps)` is a
  self-healing `CollabSocket` — on the inner socket's close it mints a **fresh** WebSocket and re-binds
  all listeners (a dead socket's listeners never fire again), retrying with exponential backoff + jitter
  up to a cap; on reopen it re-fires `onOpen` so `connectTransport`'s state exchange re-runs (Yjs merges
  idempotently). The close code is exposed (`SocketCloseEvent = {code, reason}` on every `onClose`), and
  a POLICY close (1008 policy violation / 1009 message too big — the relay REJECTED us) is **never
  retried**: it logs `relay-rejected`, reports the `rejected` status, and fires the consumer `onClose`
  with the code immediately; a transient drop still heals silently, and `onClose` otherwise fires only
  when the retry budget is exhausted (`disconnected`). The closed-union `ReconnectStatus` is
  `reconnecting`/`reconnected`/`disconnected`/`rejected`; `schedule`/`random`/`mkSocket` are injected so
  the backoff is deterministic under test.
- **Typed CONTROL channel:** inbound CONTROL frames are decoded at the shell boundary through the closed
  `RelayControlMessage` union (`{kind:"role", role: owner|editor|viewer}` | `{kind:"seed"}`) before
  reaching `TransportHooks.onControl`; an unknown payload logs `control-rejected` (via the optional
  `TransportHooks.logger`) and is dropped — a raw peer-controlled string can no longer flow into the app
  (which writes the role into the DOM).
- **Decode-as-Result + status surface (`src/shell/session.ts`):** `materialize` now RETURNS the decode
  `Result` instead of throwing inside the Yjs observer. On a corrupt remote overlay the observer logs
  loudly via a `Logger<CollabEvent>` (`"overlay-decode-rejected"`, threaded through
  `createCollabSession({ logger })`), surfaces a `CollabStatus` (`synced`/`overlay-rejected`) via
  `onStatusChange`, and **keeps last-good** state — a malicious/buggy peer degrades to a warning, never a
  crash or silent desync.
- **Collision-proof group ids:** `groupNodes` mints `g${awareness.clientID}-${seq}` (was `g${seq}` from
  a per-client counter starting at 0), so two collaborators grouping concurrently no longer overwrite
  each other's group in the shared map. No schema change (the decoder accepts `z.string()`; no consumer
  parses the id numerically).
- **Role-aware client:** the relay sends the granted role as a **control frame** (transport tag 2,
  surfaced via `connectWebSocket`'s `onControl`). The app applies it: a viewer's **editor and canvas go
  read-only** (drag/resize/delete/nudge/rename blocked, editing tools dimmed) with a "view only" badge;
  an editor grant restores editing. The server stays the security boundary — this is the matching UX.
- **Source binding:** `sourceBinding()` returns a y-codemirror.next extension that two-way-binds the
  editor to the source `Y.Text` (character-level merge, per-user text undo). The `Y.Text` stays
  encapsulated — only an opaque CodeMirror extension crosses the boundary. Two `?collab` tabs now share
  the diagram **text** live, each re-deriving its diagram locally.
- **Presence:** a y-protocols `Awareness` rides the same transport on a distinct frame. `setLocalUser`
  labels the client (name/colour); the source binding tracks the local cursor into awareness, so remote
  carets/selections render in peers' editors. Ephemeral — relayed, never stored.
- **Verified:** run `make test` (unit + integration, all green) — single-client overlay (incl.
  `replaceOverrides` and **group undo/redo**: a minted group, a top-level ungroup, and a nested-subgroup
  ungroup that splices its freed leaves into the parent's members array) + undo/redo + source + the
  **corrupt-remote-overlay** path (logs `overlay-decode-rejected`, surfaces `overlay-rejected`, keeps
  last-good, no throw) (unit); transport wiring over in-memory paired sockets + a mocked-`WebSocket`
  `webSocketTransport` + presence-frame routing + **CONTROL decoding** (closed union accepted, unknown
  payload logged + dropped) + the **reconnecting transport** (backoff schedule, re-mint-on-drop +
  re-fire-onOpen state re-exchange, budget-exhausted `disconnected` + consumer onClose, policy-close
  `rejected` with NO retry for 1008/1009 while a 1006 still retries, close-code propagation, user-close
  stops retry) + the **wasm-relay close paths** (relay-driven rejection fires close listeners once with
  the code; client-close + relay-confirm never double-fires) (unit); two-peer **convergence**
  (integration): late-joiner catch-up, concurrent moves of different nodes (no lost update), same-node
  LWW agreement, **two-client concurrent grouping both survive** (collision-proof ids), **two clients
  concurrently ungrouping different children of the same parent both survive** (no dangling group
  reference), **two clients concurrently pruning different dead members of the same group both survive**
  (neither client's removal is dropped), group⊕move merge, **visual-style convergence** (live restyle
  seen by the peer, late-joiner styles, concurrent restyles of different elements, restyle undo syncing,
  `replace()` style swap, restyle firing `onOverlayChange`), character-level source merge, remote-only
  notifications, and a property test that any interleaving converges. `store.ts`'s IndexedDB path is
  covered via `fake-indexeddb` (a real `IDBFactory` implementation, dependency-injected the same way the
  app injects the real browser `indexedDB`): round-trip + miss, copy-on-save/load, persistence across
  separate store handles opened against the same factory, a stored Yjs snapshot hydrating a session, and
  the non-binary-value-in-store rejection path.
  Module-wide coverage: above the 85/73/84/88 ratchet
  (`vitest.config.ts`) — `make cov` passes. The ratchet dropped from the module's earlier 92/76/89/95 to
  account for `wasm-relay.ts`'s loading mechanics (script injection, fetch, `WebAssembly` instantiation),
  which — like `store.ts`'s IndexedDB path before it needed `fake-indexeddb` — are real browser API
  orchestration with no meaningful Node-side unit test; covered by the Playwright e2e suite instead.
  `connectWasmRelay`'s wiring logic (the part most likely to have bugs) IS unit-tested, via an injectable
  `WasmRelayGlobal`. The relay's own RBAC/rate-limit/crash-guard/room-name/auth test suite now lives in
  `modules/relay` (Go); the real relay + socket path (incl. live source + remote cursors) is covered
  end-to-end by the app's Playwright two-tab specs, which exercise whichever relay
  `make collab-server` is currently running.
- **Boundary discipline:** peer/Y data is decoded through `@m/builder`'s Zod overlay decoder before it
  becomes branded state. The materialise step RETURNS the decode `Result` (no throw inside the Yjs
  observer); a decode failure is logged loudly via the `Logger<CollabEvent>` and surfaced as
  `overlay-rejected`, keeping last-good state (no silent fallback, no crash).
- **App integration:** the playground constructs the Yjs session behind a default-off `?collab` flag,
  connects it to the relay, binds the editor to the source `Y.Text`, and labels the client for presence;
  two tabs on `?collab&room=…` edit the **overlay and the text** live and see each other's **cursors**
  (Playwright covers the single-tab Yjs path, two-tab overlay convergence, source sync, and presence).

**Phase 1 is feature-complete.** **Phase 2 is in progress.** Landed: the repo's relay (now `modules/relay`,
Go, native + WASM), persistence, Auth0 verification, browser login, rooms/RBAC, membership source,
role-aware app UI, and a backend-free demo that runs the real relay in-process instead of skipping it.
Next: the production store (see `modules/relay/DO_NEXT.md`). Phase 3 covers pub/sub, audit/observability,
offline buffering, compaction, and compliance hooks.
