# Collaborative editor — design & scoping (CRDT)

Status: **plan only** (not yet built). This scopes a real-time, multi-user, **enterprise-ready**
collaborative editor for mermollusc, with low latency and no performance compromises. It is a
deliberate expansion beyond today's purely-client, no-backend architecture (see *Future bets* in the
root `PLAN.md`), so it needs sign-off on the decision points in §10 before any implementation.

---

## 1. Goal & requirements

Multiple users edit the **same diagram** simultaneously and see each other's changes live.

Functional:
- Concurrent edits to the **source text** (the CodeMirror buffer) merge without conflicts or lost work.
- Concurrent edits to the **sidecar overlay** (node positions/sizes/pins, element groups) merge too.
- **Presence**: live remote cursors/selections in the text and on the canvas; viewport awareness.
- **Offline-tolerant**: edit while disconnected; reconnect converges (no manual merge).
- **Undo/redo** stays per-user and correct under concurrency.

Non-functional (the "no compromises" bar):
- **Latency**: local edits apply at 0 ms (optimistic/local-first); remote propagation p99 < ~150 ms
  intra-region; presence updates feel instant (throttled to ~30–60 ms).
- **Performance**: collaboration must not slow the editor. The render stays local and frame-coalesced
  (see the `requestPaint` rAF work); CRDT payloads stay small (binary deltas; derived state never
  shared — see §4).
- **Enterprise**: SSO auth, per-document RBAC, per-tenant isolation, durable persistence + backup,
  audit trail, encryption in transit/at rest, observability with latency SLOs, abuse/DoS protection,
  data-residency/compliance hooks.

## 2. What is collaborative (and what is not)

The **source of truth** is small and shared; the **rendered diagram is derived and local**.

| State | Shared? | How |
|-------|---------|-----|
| Diagram **source text** | yes | text CRDT |
| **Overlay**: overrides (`nodeId → {position, size, pinned}`) + groups | yes | map/array CRDT |
| **Presence**: cursors, selections, viewport, user identity/color | yes, *ephemeral* | awareness (not persisted) |
| **AST / Scene / display list / pixels** | **no** | re-derived locally per client via `parseDiagram` → `layoutDiagram` → `toDisplayList` |

**Key decision: never put derived state in the CRDT.** Each client merges the shared source+overlay,
then re-parses and re-lays-out locally. This keeps the CRDT tiny and conflict-free, avoids racing on
geometry that's a pure function of the inputs, and means the existing pure core is reused verbatim —
collaboration changes *how the source/overlay get to the core*, not the core itself.

## 3. CRDT choice

**Recommend [Yjs](https://yjs.dev).** Mature, fast, compact binary deltas, a first-class CodeMirror 6
binding (`y-codemirror.next`), a built-in **awareness** protocol for presence, an `UndoManager` with
per-origin (per-user) scoping, and pluggable persistence + transport. Alternatives considered:

- **Loro** (Rust/WASM): excellent performance and time-travel; smaller ecosystem, newer. Strong
  fallback, especially if we want first-class history/time-travel (ties into the audit-trail bet).
- **Automerge**: clean document model; historically heavier on memory/op-size than Yjs (improving).

Yjs is the safe enterprise default; Loro is the "if we want history as a first-class feature" option.

## 4. Data-model mapping (Yjs)

A `Y.Doc` per diagram:
- `doc.getText("source")` — the diagram text. Bound to CodeMirror via `y-codemirror.next` (which also
  renders remote cursors from awareness).
- `doc.getMap("overrides")` — `nodeId → Y.Map{ x, y, w, h, pinned }`. Mirrors `LayoutOverrides`.
- `doc.getArray("groups")` (or a `Y.Map` keyed by group id) — mirrors the sidecar `Groups`.
- **Awareness** — `{ user: {id, name, color}, textCursor, canvasSelection, viewport }`, ephemeral.

The app reads the merged source+overlay and feeds them through the unchanged pipeline. Overlay↔text
consistency (a node deleted in text but lingering in overrides/groups) is already handled by the local
re-derive (`pruneGroups`, override clearing); the CRDT just stores both, and each client prunes locally
after merge — the invariant holds without coordination.

## 5. Architecture (new pieces, fitting the existing discipline)

```
            client                                  server (new service)
┌──────────────────────────────┐        ┌───────────────────────────────────┐
│ app/playground               │  WS    │ sync server                       │
│  └─ @m/collab (new module)   │◀──────▶│  • auth handshake (OIDC/SAML)     │
│      • Y.Doc + bindings      │ binary │  • room = one doc; access control │
│      • awareness (presence)  │ deltas │  • persistence (update log + snap)│
│      • offline buffer        │        │  • audit hooks · pub/sub fan-out  │
│  → merged source+overlay →   │        │  • metrics / tracing / SLOs       │
│    parseDiagram→layout→paint │        └───────────────────────────────────┘
│    (unchanged pure core)     │                    │
└──────────────────────────────┘            durable store + Redis pub/sub
```

- **`@m/collab` (new client module)** — wraps the `Y.Doc`, the CodeMirror binding, the overlay
  bindings, awareness, and the offline buffer behind a small API. The CRDT/network lives at the
  **shell** boundary; the functional core stays pure and collaboration-unaware. DAG: `collab` depends
  on `contracts` (overlay/source types); the **app** wires it. Existing `core`/`shell` split preserved.
- **Sync server (new service)** — a WebSocket relay (extend `y-websocket`, or a custom Go/Node service)
  that is **server-authoritative** for enterprise: it authenticates the connection, authorizes the room
  (RBAC), relays/merges updates, persists them, and emits audit + metrics. Not the static app — a
  separate deployable.
- **Phase-0 seam** — first extract today's local `source`/`overrides`/`groups` vars behind a
  **document-model interface** the app reads/writes through. With that seam, the local single-user path
  and the collaborative path are two implementations; collab becomes pluggable without rewriting the app.

## 6. Transport & persistence

- **Transport: server-authoritative WebSocket** (not pure WebRTC p2p). Enterprises need the server in
  the loop for access control, audit, and persistence. Binary Yjs sync protocol (compact deltas);
  awareness on the same socket.
- **Persistence**: the Yjs **update log + periodic snapshots** in a durable store (Postgres-backed, or
  `y-leveldb`/S3 for snapshots), per-tenant isolated, backed up, with retention policy. The update log
  doubles as the **audit trail** (who/what/when) — subsuming that Future-bet.
- **Scale**: one doc = one room; horizontal-scale server instances with a **Redis (or NATS) pub/sub**
  fan-out so clients on different instances converge; shard rooms by doc id. Snapshot compaction to cap
  log growth.

## 7. Latency & performance (the "no compromises" part)

- **Local-first**: edits mutate the local `Y.Doc` synchronously → CodeMirror/canvas update at 0 ms;
  sync is async and never on the input path.
- **Re-derive cost**: parsing is cheap (single-pass) and ELK runs in its inlined worker (off the main
  thread). Debounce **layout** (not parse) on rapid text bursts; the render is already coalesced to one
  paint per frame (`requestPaint`). Drag/resize only touch overrides → no re-parse, just a repaint.
- **Presence** is high-frequency but tiny and ephemeral → throttle to ~30–60 ms; never persisted.
- **Payloads stay small** because derived state is never shared (§4) and Yjs sends compact binary
  deltas. Target server fan-out p99 < ~150 ms intra-region; define SLOs + tracing from day one.
- **Backpressure / limits**: per-connection update rate limits; snapshot+compact to bound memory.

## 8. Enterprise requirements

- **AuthN**: OIDC/SAML SSO at the connection handshake.
- **AuthZ**: per-document roles (owner/editor/viewer) enforced **server-side** before relaying any
  update; per-**tenant** isolation (subsumes the *Multi-tenancy* Future-bet).
- **Audit**: the update log is an immutable who/changed-what/when record; export for compliance.
- **Security**: TLS in transit, encryption at rest, signed/validated tokens, room-scoped access,
  DoS/abuse protection (rate limits, connection caps).
- **Compliance**: data residency per tenant (region-pinned storage), GDPR delete/export, SOC2-friendly
  audit + access logs.
- **Observability**: metrics (active rooms, update rate, fan-out latency p50/p99), distributed tracing,
  SLO alerting.

## 9. Phasing

- **Phase 0 — the seam (no infra).** Extract source/overrides/groups behind a document-model interface
  in the app. Pure refactor; ships value (cleaner state ownership) with zero backend.
- **Phase 1 — proof of merge.** Yjs in-memory + dev `y-websocket`; text + overlay CRDT + presence;
  local-first + reconnect. Validate the "derive locally, share only source+overlay" model end-to-end.
- **Phase 2 — durable + secured.** Persistence (update log + snapshots), auth handshake, rooms + RBAC.
- **Phase 3 — scale + enterprise hardening.** Pub/sub fan-out, per-tenant isolation, audit export,
  observability/SLOs, offline buffer, compaction, compliance hooks.

## 10. Decision points (need sign-off before building)

1. **CRDT**: Yjs (recommended) vs Loro (if first-class history/time-travel matters).
2. **Sync model**: server-authoritative WebSocket (recommended for enterprise) vs WebRTC p2p.
3. **Persistence backend**: managed (e.g. a hosted Yjs service) vs self-hosted (Postgres/S3 + Redis).
4. **Auth provider / tenancy model**: which IdP; tenant = org boundary; storage residency policy.
5. **Server stack**: extend `y-websocket` (Node) vs a custom service (Go/Rust) for the relay/persistence.

## 11. Risks & open questions

- Standing up a backend is a large, ongoing operational commitment — the deliberate departure from the
  current client-only design. Scope/own it explicitly.
- Semantic (vs character) conflicts: two users editing the same node's label merge at the character
  level (fine); structural edits (one renames a node another references) re-derive consistently because
  the AST is rebuilt from the merged text. Worth a focused test matrix in Phase 1.
- Undo/redo: use Yjs `UndoManager` scoped per-origin so each user undoes only their own changes; today's
  overlay-history + CodeMirror history must be reconciled with it.
- Very large diagrams: layout (ELK) dominates and is already off-thread; if it becomes the bottleneck
  under rapid collaborative edits, add incremental/region layout — but that's independent of the CRDT.
