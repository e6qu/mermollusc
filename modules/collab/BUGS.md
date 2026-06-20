# @m/collab — bugs

Known issues surfaced by the audit sweep and deliberately deferred (not yet fixed):

- **RBAC default for tokens without a roles claim is now an explicit knob** (was a silent fail-open).
  `createClaimsRoleResolver({ defaultRole })` controls the role granted to an authenticated user whose
  token carries no per-room roles claim; it still defaults to `editor` (dev-friendly), but a production
  deployment with a real membership source should pass `defaultRole: null` to **fail closed**. Choosing
  that posture (and wiring the membership source) is the remaining decision.

- **Two genuinely-simultaneous fresh clients can both seed a room.** `seedSourceIfEmpty` is atomic
  within a client, but if two clients open the same empty room and seed within the sync window, the
  `Y.Text` merges both inserts. Robust fix needs server-side first-write coordination (the relay owns
  the seed), a later phase.

- **Overlay encoders are hand-written field lists.** `encodeOverride`/`encodeGroup` (`session.ts`) copy
  a literal set of fields; they're exhaustive for the current `NodeOverride`/`Group` types, but a new
  field added to those types would be silently dropped on the wire while the local cache keeps it.
  Latent — guard by deriving the encoder from the type, or round-tripping through `materialize()`.
