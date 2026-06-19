# Collaborative editor — design & scoping (CRDT)

Status: **Phase 0 done; decisions signed off; Phase 1 in progress (in-memory document built — see
`@m/collab`).** This scopes a real-time,
multi-user, **enterprise-ready** collaborative editor for mermollusc, with low latency and no
performance compromises. It is a deliberate expansion beyond today's purely-client, no-backend
architecture (see *Future bets* in the root `PLAN.md`).

**Phase 0 (the document-model seam) is built** — the overlay sits behind `OverlayDoc`
(`app/playground/src/document-model.ts`) and the source text behind `Editor`, so the collaborative
path plugs in as alternate implementations without touching call sites.

**The §10 decision points are now signed off** (2026-06-20):

| # | Decision | Chosen |
|---|----------|--------|
| 1 | CRDT engine | **Yjs** |
| 2 | Sync model | **Server-authoritative WebSocket** |
| 3 | Persistence / hosting | **Self-hosted: Postgres (update log) + S3 (snapshots) + Redis (fan-out)** |
| 4 | Auth / tenancy | **OIDC via the existing IdP**; tenant = org; region-pinned storage. *(Open: confirm which IdP — Okta / Entra / Auth0 / Keycloak.)* |
| 5 | Server stack | **Extend a Node Yjs server (Hocuspocus)** for Phases 1–2; revisit Go/Rust only if Phase 3 fan-out demands it |

The rest of this doc records the design these decisions resolve.

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

**Decided: [Yjs](https://yjs.dev)** (§10.1). Mature, fast, compact binary deltas, a first-class CodeMirror 6
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
- **Sync server (new service)** — a **server-authoritative** WebSocket relay built by extending a Node
  Yjs server (**Hocuspocus**, §10.5): it authenticates the connection, authorizes the room (RBAC),
  relays/merges updates, persists them, and emits audit + metrics. Not the static app — a separate
  deployable.
- **Phase-0 seam — built.** Today's local `source` sits behind `Editor` and `overrides`/`groups`
  behind `OverlayDoc` (`app/playground/src/document-model.ts`), each read/written through its
  interface. The local single-user path and the collaborative path are now two implementations; collab
  plugs in without rewriting the app.

## 6. Transport & persistence

- **Transport: server-authoritative WebSocket** (§10.2; not pure WebRTC p2p). Enterprises need the
  server in the loop for access control, audit, and persistence. Binary Yjs sync protocol (compact
  deltas); awareness on the same socket.
- **Persistence (§10.3): self-hosted Postgres + S3 + Redis.** The Yjs **update log** lives in Postgres
  (per-tenant isolated, backed up, with a retention policy) and doubles as the **audit trail**
  (who/what/when); periodic **snapshots** go to S3. Chosen over a managed Yjs service for
  data-residency/compliance control and no per-seat cost.
- **Scale**: one doc = one room; horizontal-scale server instances with **Redis pub/sub** fan-out so
  clients on different instances converge; shard rooms by doc id. Snapshot compaction caps log growth.

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

- **AuthN**: **OIDC via the existing IdP** at the connection handshake (§10.4; specific provider TBD).
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

- **Phase 0 — the seam (no infra). ✅ DONE.** `source` behind `Editor`, `overrides`/`groups` behind
  `OverlayDoc` (`app/playground/src/document-model.ts`). Pure refactor; shipped cleaner state
  ownership with zero backend.
- **Phase 1 — proof of merge (in progress).** **In-memory document done:** `@m/collab`'s
  `createCollabSession` (Yjs `Y.Doc` = source `Y.Text` + overlay `Y.Map`s) implements the `OverlayDoc`
  port; two-peer convergence is proven by tests (concurrent overlay + character-level source merge, a
  property test, late-joiner catch-up), and the app can run it behind a default-off `?collab` flag.
  **Remaining:** a dev Hocuspocus/`y-websocket` transport + awareness/presence + the live CodeMirror↔
  `Y.Text` binding, to validate local-first + reconnect end-to-end.
- **Phase 2 — durable + secured.** Persistence (update log + snapshots), auth handshake, rooms + RBAC.
- **Phase 3 — scale + enterprise hardening.** Pub/sub fan-out, per-tenant isolation, audit export,
  observability/SLOs, offline buffer, compaction, compliance hooks.

## 10. Decisions (signed off 2026-06-20)

1. **CRDT → Yjs.** Mature, first-class CodeMirror 6 binding, built-in awareness for presence, and an
   `UndoManager` with per-origin scoping that maps directly onto per-user undo. (Loro stays the
   fallback if first-class history/time-travel later becomes a headline feature.)
2. **Sync model → server-authoritative WebSocket.** The server stays in the loop to enforce RBAC,
   own the audit log, and persist — none of which WebRTC p2p can do server-side. Binary Yjs sync
   protocol + awareness on one socket.
3. **Persistence → self-hosted: Postgres + S3 + Redis.** Update log in Postgres (doubles as the audit
   trail), periodic snapshots in S3, Redis pub/sub for cross-instance fan-out. Chosen over a managed
   Yjs service for data-residency/compliance control and no per-seat cost — accepting the larger ops
   commitment.
4. **Auth / tenancy → OIDC via the existing IdP.** Tenant = org boundary; per-tenant region-pinned
   storage. **Open item:** confirm the specific IdP (Okta / Entra / Auth0 / Keycloak) before Phase 2.
5. **Server stack → extend a Node Yjs server (Hocuspocus).** Reuses the Yjs ecosystem and its
   auth/persistence/Redis hooks; the relay is IO-bound, so Node suffices for Phases 1–2. Revisit a
   custom Go/Rust relay only if fan-out becomes the Phase 3 bottleneck. (Exact Hocuspocus API/version
   to be verified against current docs at build time, per the repo's no-memory-claims rule.)

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
