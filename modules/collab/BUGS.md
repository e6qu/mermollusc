# @m/collab — bugs

Known issues surfaced by the audit sweep and deliberately deferred (not yet fixed):

- **RBAC default is permissive for tokens without a roles claim.** When auth is on, a valid token with
  no `org_id` and no per-room roles claim resolves to `editor` for every room (`rbac.mjs`
  `createClaimsRoleResolver`). That's "fail-open" for the no-claim case. A stricter posture (default
  **deny** unless a positive grant exists) is the safer enterprise default — a policy decision to make
  before production, alongside the real membership source.

- **Two genuinely-simultaneous fresh clients can both seed a room.** `seedSourceIfEmpty` is atomic
  within a client, but if two clients open the same empty room and seed within the sync window, the
  `Y.Text` merges both inserts. Robust fix needs server-side first-write coordination (the relay owns
  the seed), a later phase.

- **Overlay encoders are hand-written field lists.** `encodeOverride`/`encodeGroup` (`session.ts`) copy
  a literal set of fields; they're exhaustive for the current `NodeOverride`/`Group` types, but a new
  field added to those types would be silently dropped on the wire while the local cache keeps it.
  Latent — guard by deriving the encoder from the type, or round-tripping through `materialize()`.
