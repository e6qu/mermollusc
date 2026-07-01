# @m/collab — plan

Collaborative document model — the Yjs-backed CRDT implementation of the editor's shared state.
Phase 1 of [`docs/collab-editor-plan.md`](../../docs/collab-editor-plan.md).

## Responsibility

- Hold the **shared** editor state in one `Y.Doc`: the diagram **source text** (`Y.Text`) and the
  sidecar **overlay** (manual node positions/sizes + element groups, in two `Y.Map`s).
- Provide a `CollabSession` whose `overlay` satisfies the `@m/contracts` **`OverlayDoc`** port, so the
  app swaps the local single-user document for the collaborative one without touching call sites.
- Expose the binary-sync seam (`state`/`applyUpdate`/`onUpdate`) a transport (a WebSocket server, or an
  in-memory test) wires between peers, plus remote-change notifications (`onSourceChange`,
  `onOverlayChange`).
- Reuse the **pure** overlay operations and the Zod overlay decoder from `@m/builder` — peer data
  crosses the boundary validated, never trusted raw — so the merge logic stays single-sourced.

It explicitly does **not** derive the diagram (that stays a local pure-core computation in the app from
the merged source+overlay — see the plan §4), own a network transport/server, or do auth/persistence
(those are Phases 2–3).

## Public API (stable surface)

- `createCollabSession({ initialOverrides, initialGroups, initialSource, initialUpdate, save }) →
  CollabSession`; `initialUpdate` is an optional whole-room Yjs snapshot that wins over seeds.
- `CollabSession`: `overlay: OverlayDoc`, `source()/setSource()/spliceSource()`,
  `sourceBinding()` (a CodeMirror extension binding the editor to the source `Y.Text`, with presence),
  `setLocalUser()`, `onSourceChange()/onOverlayChange()`, the binary-sync seam
  (`state()/applyUpdate()/onUpdate()` + `awarenessState()/applyAwarenessUpdate()/onAwarenessUpdate()`),
  `destroy()`.
- `overlay.replaceOverrides(overrides)` applies whole-map override replacement through the same
  decoded Y.Map storage as point edits, so local and collaborative documents match the app's regenerate
  semantics.
- Session also exposes `onStatusChange(listener)` (a closed-union `CollabStatus`: `synced` /
  `overlay-rejected`) and accepts an optional `logger: Logger<CollabEvent>` (`"overlay-decode-rejected"`)
  so a corrupt remote overlay is logged + surfaced instead of throwing.
- Transport: `connectTransport(session, socket, hooks?)` / `webSocketTransport(url)` /
  `connectWebSocket(session, url, hooks?)` — frames document, presence, and server→client control
  (e.g. the role, via `TransportHooks.onControl`) distinctly on one socket. Plus
  `reconnectingWebSocketTransport(url, deps)` — a self-healing `CollabSocket` (mints a fresh inner
  socket on drop, backoff + jitter + cap, re-exchanges state on reopen, fires the consumer `onClose`
  only when the budget is exhausted) surfacing a closed-union `ReconnectStatus`
  (`reconnecting`/`reconnected`/`disconnected`); `ReconnectDeps` injects `schedule`/`random`/`mkSocket`.
- Browser-compatible stores: sync `RoomStore` implementations (`createMemoryRoomStore()`,
  `createWebStorageRoomStore(storage, keyPrefix?)`) plus async `createIndexedDbRoomStore(indexedDB)`
  persist whole-room Yjs snapshots for backend-free runtime parity.
- Server (optional, `server/`): `relay.mjs` (`startRelay({ store, authorize, authorizeRoom, rateLimit,
  now })` — crash-guarded, rate-limited, tag-allow-listed, room-name-validated, flushes on
  SIGINT/SIGTERM), `store.mjs` (`createMemoryRoomStore` / `createFileRoomStore` with legacy aliases —
  the `RoomStore` durability seam), `auth.mjs` (`createVerifier` / `createAuth0Authorizer` — OIDC token verification), and
  `rbac.mjs` (`createClaimsRoleResolver({ defaultRole })` — **fails closed** by default / `canWrite` —
  per-document roles + tenant isolation).

## Design notes

- **Storage shape mirrors `serializeOverlay`.** Each override/group is stored in its `Y.Map` in the
  exact plain-object shape `@m/builder`'s `decodeOverlay` already validates, so materialising the
  branded maps reuses that decoder verbatim.
- **Per-key LWW.** Overrides/groups are keyed by id, so concurrent edits to *different* elements both
  survive; concurrent edits to the *same* element converge to one agreed value. Source text merges at
  the character level (`Y.Text`).
- **Origins.** Local edits use a `LOCAL` transaction origin (tracked for undo, broadcast on `onUpdate`);
  applied remote updates use `REMOTE` (not re-broadcast); the initial seed uses `SEED` (kept out of
  history). Undo/redo is a `Y.UndoManager` scoped to `LOCAL` — each user undoes only their own edits.

## Roadmap

Phase 1 (this module): done — the Yjs document, in-memory convergence, transport, source binding, and
presence. Phase 2 is in progress on the repo's relay: persistence, Auth0 verification, rooms/RBAC, and
role-aware UI are in; browser login and the production store remain. Phase 3 covers pub/sub,
audit/observability, offline buffering, compaction, and compliance hooks.
