# @m/collab — bugs

Known issues surfaced by the audit sweep and deliberately deferred (not yet fixed):

- **Two genuinely-simultaneous fresh clients can both seed a room.** `seedSourceIfEmpty` is atomic
  within a client, but if two clients open the same empty room and seed within the sync window, the
  `Y.Text` merges both inserts. Robust fix needs server-side first-write coordination (the relay owns
  the seed), a later phase.

Resolved (hardening sweep):

- ~~**Backend-free collab persistence used app-local overlay/source persistence, not the room snapshot
  seam.**~~ Fixed — `@m/collab` now has a browser-compatible `RoomStore` and session `initialUpdate`
  hydration, so a local browser runtime can persist whole Yjs room snapshots.
- ~~**Backend-free browser rooms used string-only Web Storage as the richest local store.**~~ Fixed —
  `createIndexedDbRoomStore(indexedDB)` persists binary whole-room Yjs snapshots in IndexedDB through
  an async store contract, keeping the browser demo on a real embedded database seam.

- ~~**RBAC fails open on tokens without a roles claim.**~~ Fixed — `createClaimsRoleResolver` now
  defaults `defaultRole: null` (**fail closed**: a verified token with no per-room role is denied). The
  relay's run-block computes `authEnabled = Boolean(domain && audience)` and passes
  `defaultRole: authEnabled ? null : "editor"`, so an auth-on deployment denies role-less tokens while
  auth-off dev/e2e keep the editor default. (+ fail-closed-by-default + dev-posture RBAC tests.)

- ~~**Group-id collision between collaborators.**~~ Fixed — `groupNodes` minted `g${seq}` from a
  per-client counter starting at 0, so two collaborators grouping concurrently overwrote each other in
  the shared map. Now mints `g${awareness.clientID}-${seq}` (collision-proof; the decoder accepts any
  `z.string()` and no consumer parses the id numerically). (+ two-client concurrent-grouping survival
  test.)

- ~~**A malformed CRDT update crashed the whole relay.**~~ Fixed — `applyUpdate` is wrapped in
  try/catch (logged + dropped before re-broadcast), and `socket`/`wss` `error` handlers keep transport
  faults off `uncaughtException`. (+ relay crash-guard integration test.)

- ~~**A corrupt remote overlay threw inside the Yjs observer.**~~ Fixed — `materialize` returns the
  decode `Result`; the observer logs `overlay-decode-rejected` via a `Logger<CollabEvent>`, surfaces a
  `CollabStatus`, and keeps last-good state. (+ corrupt-remote-overlay unit test.)

Resolved (earlier polish & harden):

- ~~**Overlay encoders are hand-written field lists.**~~ Fixed — `session.ts` no longer carries its own
  `encodeOverride`/`encodeGroup`; it encodes Y.Map entries through `@m/builder`'s `encodeOverrideEntry`
  /`encodeGroupEntry`, the same per-entry encoders `serializeOverlay` (JSON persistence) uses — so the
  two wire shapes can't drift. Each encoder carries a `satisfies Record<keyof NodeOverride|Group, unknown>`
  guard, so a newly-added domain field is a **compile error** at the encoder instead of a silent
  wire-drop. (+builder unit test for the per-entry encoders' shape + round-trip.)

Checked while adding overlay override replacement for regenerate.
