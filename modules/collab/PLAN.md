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
  (e.g. the role, via `TransportHooks.onControl`) distinctly on one socket; `TransportHooks.authToken`
  sends an access token as the first client auth frame when auth is enabled. Plus
  `reconnectingWebSocketTransport(url, deps)` — a self-healing `CollabSocket` (mints a fresh inner
  socket on drop, backoff + jitter + cap, re-exchanges state on reopen, fires the consumer `onClose`
  only when the budget is exhausted) surfacing a closed-union `ReconnectStatus`
  (`reconnecting`/`reconnected`/`disconnected`); `ReconnectDeps` injects `schedule`/`random`/`mkSocket`.
- Browser-compatible stores: sync `RoomStore` implementations (`createMemoryRoomStore()`,
  `createWebStorageRoomStore(storage, keyPrefix?)`) plus async `createIndexedDbRoomStore(indexedDB)`
  persist whole-room Yjs snapshots for backend-free runtime parity.
- Server: moved to **`modules/relay`** (Go, not TypeScript — see that module's own docs). This module no
  longer has a `server/` directory; `@m/collab` owns only the browser-side Yjs document/transport, which
  speaks the same wire protocol to whichever relay is running (the Go native binary in production, or the
  same core compiled to WebAssembly for the backend-free demo). `make collab-server` at the repo root
  still runs *a* relay for local two-tab dev; it now runs `modules/relay`'s binary.
- **WASM relay seam (`src/shell/wasm-relay.ts`):** `loadWasmRelay()` (script-injects `wasm_exec.js`,
  instantiates `relay.wasm`) and `connectWasmRelay({ room, store })` (returns a `CollabSocket` wired to
  the WASM module's four exported functions, fed into the same `connectTransport` the real-relay path
  uses) — this is what makes the backend-free demo run the real relay in-process instead of skipping it.
  `WasmRelayGlobal` is injectable so the wiring logic unit-tests without a browser; the loading mechanics
  themselves are browser-only and covered by `app/playground`'s Playwright e2e suite instead.

## Design notes

- **Storage shape mirrors `serializeOverlay`** on the wire: `decodeOverlay` (materialising) and
  `encodeGroupEntry`/`encodeOverrideEntry` (writing) still speak the exact flat plain-object shape JSON
  persistence uses. Only the *live* Yjs container differs from that flat shape — see the next point.
- **Per-key LWW for overrides; per-member CRDT for group membership.** Overrides are keyed by id, so
  concurrent edits to *different* nodes both survive and concurrent edits to the *same* node converge to
  one agreed value (whole-value LWW). A group, though, is a nested `Y.Map` (`id`/`label`/`locked` fields
  + a nested `members` `Y.Array`) rather than one flat value: `label`/`locked` are per-field LWW, and
  `members` merges per-element like `Y.Text` — two peers editing *different members of the same group*
  concurrently (e.g. each dissolving a different child into a shared parent, or each pruning a different
  dead node from the same group) both survive, instead of one whole-group write silently dropping the
  other's edit. Source text merges at the character level (`Y.Text`).
- **Origins.** Local edits use a `LOCAL` transaction origin (tracked for undo, broadcast on `onUpdate`);
  applied remote updates use `REMOTE` (not re-broadcast); the initial seed uses `SEED` (kept out of
  history). Undo/redo is a `Y.UndoManager` scoped to `LOCAL` — each user undoes only their own edits.

## Roadmap

Phase 1 (this module): done — the Yjs document, in-memory convergence, transport, source binding, and
presence. Phase 2 is in progress on the repo's relay/app path: persistence, Auth0 verification, browser
PKCE login, rooms/RBAC, a static membership source, and role-aware UI are in; the production store
remains. Phase 3 covers pub/sub,
audit/observability, offline buffering, compaction, and compliance hooks.
