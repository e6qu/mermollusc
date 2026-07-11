# @m/collab — do next

- **App wiring for the 2026-07-10 review fixes** (app/playground, not this module): switch
  `onControl` handling to the typed `RelayControlMessage` union (`{kind:"role"}` → `applyRole(role)`,
  `{kind:"seed"}` → seed grant), surface the new `rejected` `ReconnectStatus`, pass
  `TransportHooks.logger`, and optionally seed `initialEdgeStyles`/`initialNodeStyles` from the persisted
  overlay when constructing the collab session.
- *(done)* **Visual overlay styles sync** — node accents + edge route styles moved from per-client
  session memory into two synced `Y.Map`s (undo-scoped, in `replace()`/`persist()`, convergence-tested);
  peers now see restyles. See `BUGS.md` (review sweep) for the rest of that sweep: typed CONTROL
  decoding, policy-close no-retry with `SocketCloseEvent`, wasm-relay crash/close surfacing.

- *(done)* Phase 1 document: `createCollabSession` (Yjs `Y.Doc` = source `Y.Text` + overlay `Y.Map`s),
  `OverlayDoc`-compatible `overlay`, undo/redo via `Y.UndoManager`, binary-sync seam, in-memory
  convergence tests.
- *(done)* `OverlayDoc.replaceOverrides` is implemented by the Yjs overlay, keeping collaborative and
  local regenerate behavior aligned.
- *(done)* **Dev transport:** `connectTransport`/`webSocketTransport`/`connectWebSocket` bind the
  binary-sync seam to a `WebSocket`; `dev-server.mjs` is a server-authoritative relay (rooms, per-room
  `Y.Doc`, state-on-join + broadcast). Two `?collab` tabs converge live (Playwright). No auth/persistence
  /presence yet.
- *(done)* **Live source binding:** `sourceBinding()` (y-codemirror.next) two-way-binds the editor to
  the source `Y.Text`; two `?collab` tabs share the diagram text live (character merge, per-user text
  undo). The app drops CodeMirror's own history in collab mode and seeds the room if empty.
- *(done)* **Presence:** a y-protocols `Awareness` rides the transport on a distinct frame;
  `setLocalUser` labels the client and the source binding tracks the local cursor into awareness, so
  remote carets render in peers' editors. Follow-up: presence on the **canvas** (remote selection
  highlights) + a viewport/active-users indicator.
- *(done)* **Durable persistence:** the relay has a pluggable `RoomStore` — memory default + a
  file-snapshot store (`PERSIST_DIR`); rooms survive a restart. Every connection passes an `authorize(req)`
  hook (default allow) — the auth seam. The server is optional; single-user local needs none of it. (Now
  in `modules/relay`, Go — see below.)
- *(done)* **Browser room snapshot seam:** `src/shell/store.ts` provides memory + Web Storage
  `RoomStore` implementations and `createCollabSession` can hydrate from a saved Yjs `initialUpdate`.
  The Pages demo can persist a local room through the same whole-snapshot contract as the relay.
- *(done)* **Server/browser store semantics aligned:** the relay's memory store copies snapshots on
  save/load just like the browser `RoomStore`, and both speak the same load/save contract.
- *(done)* **Auth0 OIDC handshake:** the relay verifies the first client auth frame against the issuer
  JWKS; admits or closes 1008 (buffering during the async check). Env-gated; default allow. Decided to
  extend our own relay rather than adopt Hocuspocus (§10.5).
- *(done)* **Browser Auth0 login:** the app now runs an env-gated Auth0 Authorization Code + PKCE
  browser flow, stores the access token for the browser session, sends it as the first WebSocket auth
  frame, and uses token claims for presence name/colour.
- *(done)* **Rooms + RBAC:** the relay resolves per-document roles + isolates tenants; closes 1008 on no
  access and enforces viewers read-only.
- *(done)* **Role-aware client:** the relay sends the role (a CONTROL frame); the app makes a viewer's
  editor + canvas read-only with a "view only" badge. Follow-up: a presence "active users" list
  (names/colours from awareness), and owner-only affordances (e.g. manage members) once memberships exist.
- **Production `RoomStore`:** swap the file store for Postgres (update log = audit trail) + S3
  (snapshots) + Redis fan-out — now tracked in `modules/relay/DO_NEXT.md` (the relay's async-capable
  `Store` interface already accommodates this). Browser-local embedded storage is now represented by the
  async IndexedDB room store behind the same snapshot interface; SQLite/WASM remains optional only if
  future queries outgrow whole-room snapshots. **Migration note for whoever builds it:** the nested-group
  redesign (see the work-log entry) was a breaking Yjs wire-format change — any room persisted before it
  holds flat group values that now decode as malformed and are rejected loudly. Fine today (no production
  store exists), but a production store MUST ship with a migration or explicit versioning for pre-existing
  rooms, not inherit that "acceptable while experimental" stance silently.
- *(done)* **Decode-failure surfacing:** a corrupt peer overlay no longer throws inside the Y observer —
  `materialize` returns the decode `Result`; the observer logs `overlay-decode-rejected` via a
  `Logger<CollabEvent>` (threaded through `createCollabSession({ logger })`), surfaces a `CollabStatus`
  via `onStatusChange`, and keeps last-good state.
- *(done)* **Relay + transport hardening:** crash guard around `applyUpdate` + `socket`/`wss` error
  handlers; per-socket frames/sec + bytes/sec token-bucket rate limit (injectable); frame-tag allow-list
  (DOC/AWARE only); room-name validation at the boundary; throttled viewer-drop log; graceful flush on
  SIGINT/SIGTERM; RBAC fail-closed default. `reconnectingWebSocketTransport` self-heals a dropped socket
  (backoff + jitter + cap, re-exchange on reopen, `ReconnectStatus`). Collision-proof group ids.
- **App wiring (*done*):** the app uses `reconnectingWebSocketTransport` + `connectTransport`, surfaces
  `ReconnectStatus` (reconnecting/reconnected/disconnected) and the session's `onStatusChange`
  (`overlay-rejected`) as status-bar messages, and passes a console logger — all behind the default-off
  `?collab` flag (`app/playground/src/main.ts`).
- *(done)* **Membership source:** `MEMBERSHIP_FILE` now loads a strict static room/member role source
  behind `authorizeRoom`, so auth-on deployments can grant room access without putting all per-room
  roles into the token.
- *(done)* **Relay moved to Go (`modules/relay`), native + WASM:** the entire server — room registry,
  RBAC, rate limiting, frame protocol, auth, persistence — moved out of this module's `server/*.mjs` into
  a new Go module, verified as a drop-in replacement (a ported copy of the old `relay.test.mjs`/
  `rbac.test.mjs`/`membership.test.mjs`/`store.test.mjs`/`auth.test.mjs` suites, plus the full existing
  `app/playground` Playwright e2e suite passing unchanged against it). `@m/collab` now owns only the
  browser-side Yjs document/transport. The same relay core also compiles to WebAssembly
  (`src/shell/wasm-relay.ts`), so the backend-free demo runs the real relay in-process instead of skipping
  it — see `modules/relay/DO_NEXT.md` for what's still open there (the production store).
- *(done)* **Same-key merge for groups:** a group is now a nested `Y.Map` (`id`/`label`/`locked` fields +
  a nested `members` `Y.Array`) instead of one flat value — `label`/`locked` stay per-field LWW, and
  `members` merges per-element (like `Y.Text`), so two peers editing *different members of the same
  group* concurrently (dissolving different children into a shared parent; pruning different dead nodes
  from the same group) both survive instead of one whole-group write clobbering the other. The JSON wire
  shape is unchanged (`encodeGroupEntry`/`decodeOverlay` still speak the flat `{id,label,members,locked}`
  shape); only the live Yjs container and `session.ts`'s mutators (`groupNodes`/`ungroupAt`/
  `setGroupLocked`/`setGroupLabel`/`pruneGroupsTo`/`replace`) changed, plus the `yGroups` observer (now
  `observeDeep`, since nested-array edits are invisible to a shallow `observe`). This IS a breaking Yjs
  wire-format change for any pre-existing persisted room (a stale flat group value now decodes as
  malformed and is rejected loudly, same as any other corrupt overlay) — acceptable since the feature is
  still experimental/gated and has no production store yet (see the remaining item below). (+ two new
  convergence tests reproducing the old bug — concurrent ungroup-into-shared-parent and concurrent prune
  of the same group both used to silently drop one side's edit — plus group undo/redo unit tests.)
