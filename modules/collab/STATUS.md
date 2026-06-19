# @m/collab — status

**State:** Phase 1 — built and green. In-memory document **plus a dev WebSocket transport**. No auth /
persistence / presence yet (those are Phases 2–3).

- **What works:** `createCollabSession` wraps a `Y.Doc` (source `Y.Text` + overrides/groups `Y.Map`s).
  Its `overlay` implements the `OverlayDoc` port (move/resize/group/ungroup/lock/label/prune/replace/
  clear, undo/redo via `Y.UndoManager`, persist via injected `save`). Source channel:
  `source`/`setSource`/`spliceSource` + `onSourceChange`. Binary sync: `state`/`applyUpdate`/`onUpdate`.
- **Transport:** `connectTransport(session, socket)` binds the binary-sync seam to any `CollabSocket`;
  `webSocketTransport(url)`/`connectWebSocket(session, url)` use the platform `WebSocket`. `dev-server.mjs`
  is a server-authoritative relay (rooms by URL path; per-room `Y.Doc`; full state on join + broadcast).
  Run it with `make collab-server`.
- **Verified:** 30 tests green — single-client overlay + undo/redo + source (unit); transport wiring
  over in-memory paired sockets + a mocked-`WebSocket` `webSocketTransport` (unit); two-peer
  **convergence** (integration): late-joiner catch-up, concurrent moves of different nodes (no lost
  update), same-node LWW agreement, group⊕move merge, character-level source merge, remote-only
  notifications, and a property test that any interleaving converges. The **real** relay + socket path
  is covered end-to-end by the app's Playwright two-tab spec. Coverage ~98% stmts (ratchet in
  `vitest.config.ts`).
- **Boundary discipline:** peer/Y data is decoded through `@m/builder`'s Zod overlay decoder before it
  becomes branded state; a decode failure throws loudly (no silent fallback).
- **App integration:** the playground constructs the Yjs `overlay` behind a default-off `?collab` flag
  and connects it to the relay; two tabs on `?collab&room=…` edit the overlay live (Playwright covers
  both the single-tab Yjs path and two-tab convergence).

**Next:** awareness/presence (remote cursors), the live CodeMirror ↔ `Y.Text` source binding, and then
the production server (Hocuspocus) with auth/persistence (Phases 2–3).
