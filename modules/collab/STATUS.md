# @m/collab — status

**State:** Phase 1 feature-complete; **Phase 2 in progress**. The relay itself (persistence, Auth0 OIDC
verification, rooms + RBAC, static membership source) moved out of this module into **`modules/relay`**
(Go, native + — Milestone 2 — WebAssembly for the backend-free demo; see that module's own docs). This
module now owns only the browser-side Yjs document/transport, which speaks the same wire protocol to
whichever relay is running. The app runs single-user by default; with `?collab` set it connects to the
relay (via `reconnectingWebSocketTransport`) and binds the editor to the shared doc.

- **What works:** `createCollabSession` wraps a `Y.Doc` (source `Y.Text` + an overrides `Y.Map` +
  a groups `Y.Map`). Its `overlay` implements the `OverlayDoc` port (move/resize/group/ungroup/lock/
  label/prune/replace/replaceOverrides/clear, undo/redo via `Y.UndoManager`, persist via injected
  `save`). Source channel: `source`/`setSource`/`spliceSource` + `onSourceChange`. Binary sync:
  `state`/`applyUpdate`/`onUpdate`.
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
- **Reconnecting transport (`src/shell/transport.ts`):** `reconnectingWebSocketTransport(url, deps)` is a
  self-healing `CollabSocket` — on the inner socket's close it mints a **fresh** WebSocket and re-binds
  all listeners (a dead socket's listeners never fire again), retrying with exponential backoff + jitter
  up to a cap; on reopen it re-fires `onOpen` so `connectTransport`'s state exchange re-runs (Yjs merges
  idempotently). The consumer `onClose` fires only when the retry budget is exhausted. It surfaces a
  closed-union `ReconnectStatus` (`reconnecting`/`reconnected`/`disconnected`) for the app, and injects
  `schedule`/`random`/`mkSocket` so the backoff is deterministic under test. `webSocketTransport`/
  `connectWebSocket` are unchanged.
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
- **Verified:** 57 tests green (46 unit + 11 integration) — single-client overlay (incl.
  `replaceOverrides` and **group undo/redo**: a minted group, a top-level ungroup, and a nested-subgroup
  ungroup that splices its freed leaves into the parent's members array) + undo/redo + source + the
  **corrupt-remote-overlay** path (logs `overlay-decode-rejected`, surfaces `overlay-rejected`, keeps
  last-good, no throw) (unit); transport wiring over in-memory paired sockets + a mocked-`WebSocket`
  `webSocketTransport` + presence-frame routing + the **reconnecting transport** (backoff schedule,
  re-mint-on-drop + re-fire-onOpen state re-exchange, budget-exhausted `disconnected` + consumer onClose,
  user-close stops retry) (unit); two-peer **convergence** (integration): late-joiner catch-up, concurrent
  moves of different nodes (no lost update), same-node LWW agreement, **two-client concurrent grouping
  both survive** (collision-proof ids), **two clients concurrently ungrouping different children of the
  same parent both survive** (no dangling group reference), **two clients concurrently pruning different
  dead members of the same group both survive** (neither client's removal is dropped), group⊕move merge,
  character-level source merge, remote-only notifications, and a property test that any interleaving
  converges. `store.ts`'s IndexedDB path is covered via `fake-indexeddb` (a real `IDBFactory`
  implementation, dependency-injected the same way the app injects the real browser `indexedDB`):
  round-trip + miss, copy-on-save/load, persistence across separate store handles opened against the same
  factory, a stored Yjs snapshot hydrating a session, and the non-binary-value-in-store rejection path.
  Module-wide coverage: 92.2% stmts/77.1% branch/89.5% funcs/96.0% lines against a 92/76/89/95 ratchet
  (`vitest.config.ts`) — `make cov` passes. The relay's own RBAC/rate-limit/crash-guard/room-name/auth
  test suite now lives in `modules/relay` (Go); the real relay + socket path (incl. live source + remote
  cursors) is covered end-to-end by the app's Playwright two-tab specs, which exercise whichever relay
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
Go), persistence, Auth0 verification, browser login, rooms/RBAC, membership source, and role-aware app UI.
Next: the production store (see `modules/relay/DO_NEXT.md`) and Milestone 2 (WASM + demo integration).
Phase 3 covers pub/sub, audit/observability, offline buffering, compaction, and compliance hooks.
