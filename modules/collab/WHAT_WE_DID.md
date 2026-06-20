# @m/collab — work log

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
