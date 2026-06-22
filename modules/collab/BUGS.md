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

Resolved (polish & harden):

- ~~**Overlay encoders are hand-written field lists.**~~ Fixed — `session.ts` no longer carries its own
  `encodeOverride`/`encodeGroup`; it encodes Y.Map entries through `@m/builder`'s `encodeOverrideEntry`
  /`encodeGroupEntry`, the same per-entry encoders `serializeOverlay` (JSON persistence) uses — so the
  two wire shapes can't drift. Each encoder carries a `satisfies Record<keyof NodeOverride|Group, unknown>`
  guard, so a newly-added domain field is a **compile error** at the encoder instead of a silent
  wire-drop. (+builder unit test for the per-entry encoders' shape + round-trip.)

Checked while adding overlay override replacement for regenerate.
