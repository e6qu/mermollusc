# @m/collab — bugs

No known open bugs.

Resolved (review sweep, found + fixed 2026-07-10):

- ~~**Peers silently never saw restyles.**~~ Node colour accents and per-edge route styles were held in
  per-client session memory ("not yet a synced Y.Map") while positions/groups synced — a collaborator's
  recolour or curved-edge choice simply didn't propagate, with no error. Fixed: two more `Y.Map`s
  (`edgeStyles`/`nodeStyles`) in the shared doc, written through `@m/builder`'s per-entry wire encoders
  and re-materialised through the shared Zod decoder, included in the undo scope and in
  `replace()`/`persist()`. Six new convergence tests (live restyle, late joiner, concurrent restyles,
  undo sync, replace, onOverlayChange). The `OverlayDoc` port needed no change.
- ~~**Inbound CONTROL frames were applied without validation.**~~ Any peer-controlled string became "the
  role" and was written into the DOM by the app. Fixed: CONTROL payloads decode through the closed
  `RelayControlMessage` union (`owner`/`editor`/`viewer` roles + the `seed` grant) at the transport
  boundary; unknown payloads log `control-rejected` and are dropped.
- ~~**Reconnect retried policy rejections like transient drops.**~~ A 1008 (bad room/token/rate-limit) or
  1009 (frame too big) close was retried up to the full backoff budget, hammering the relay with replays
  of the same rejection and hiding the real failure for ~minutes. Fixed: `SocketCloseEvent` exposes the
  close code on every `onClose`; `reconnectingWebSocketTransport` stops immediately on 1008/1009, logs
  `relay-rejected`, reports the new `rejected` status, and fires the consumer `onClose` with the code.
- ~~**A Go runtime crash in the WASM relay was swallowed; a failed load was cached forever.**~~
  `void go.run(instance)` discarded the runtime's exit/crash, leaving every connection believing it was
  live, and a rejected `loaded` promise made every later `loadWasmRelay()` re-throw the stale error with
  no retry. Fixed: `go.run`'s settlement is observed (loud `console.error` + every live wasm-relay socket
  is closed), and a rejected load evicts the cache so the next call retries.
- ~~**A relay-side rejection never reached the wasm-relay client.**~~ The Go side's `Close` was a no-op
  towards JS (see `modules/relay/BUGS.md`); the TS side had no way to learn the connection was refused.
  Fixed together with the relay: `mermolluscRelayConnect` now takes `onClosed(code, reason)`, and
  `connectWasmRelay` fires its close listeners exactly once whichever side closes first.

Resolved (relay-owned seed grant, 2026-07-02):

- ~~**Two genuinely-simultaneous fresh clients could both seed a room.**~~ Fixed — the relay now grants
  seed rights to exactly ONE connection per empty room (the reserved "seed" CONTROL message, decided
  under the relay's admission mutex so concurrent joins can never both win; re-granted to a surviving
  peer if the holder disconnects while the room is still empty). A connected client seeds only when
  granted; `seedSourceIfEmpty`'s empty-check stays as a belt. An UNCONNECTED session (auth required,
  not signed in) still seeds locally — no peer to race, no relay to grant. Covered by three Go
  admission tests (exactly-one grant across concurrent joins; no grant for a room with content;
  re-grant to the survivor) and an e2e two-tab race spec asserting exactly one copy of the seeded
  source in both tabs.

Resolved (same-key group merge):

- ~~**Concurrent edits to the same group's membership silently dropped one side.**~~ Fixed — a group was
  stored as one flat whole-value `Y.Map` entry (LWW per group), so two clients concurrently editing the
  *same* group's membership (e.g. each ungrouping a different child into a shared parent, or each
  pruning a different dead node from the same group) had one client's whole-group rewrite silently
  clobber the other's — in the ungroup case this could even leave a **dangling reference** to an
  already-deleted group id in the surviving parent's members. A group is now a nested `Y.Map`
  (`id`/`label`/`locked` fields + a nested `members` `Y.Array`), so member-level edits merge per-element
  like `Y.Text` instead of whole-group LWW. (+ two convergence tests that fail against the old
  implementation and pass against the new one.)

Resolved (hardening sweep):

- ~~**Auth-on relay required all per-room roles to ride inside OIDC token claims.**~~ Fixed — the relay
  can now load a strict server-side membership file via `MEMBERSHIP_FILE`, preserving fail-closed access
  without bloating tokens.

- ~~**Browser collab identity was still a random placeholder after relay auth existed.**~~ Fixed — an
  env-gated Auth0 PKCE browser flow now supplies the access token for the first auth frame and derives
  presence name/colour from token claims.

- ~~**Auth0 access tokens rode in the WebSocket URL.**~~ Fixed — clients now send the token as the first
  auth frame after the socket opens, and auth-enabled relays wait for that frame before admitting
  document/presence traffic.

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
