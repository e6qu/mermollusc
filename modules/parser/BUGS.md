# @m/parser — bugs

Open (external review, codex `gpt-5.5`, 2026-06-19):

- **Cloud group id collision.** `cloud-parse.ts` synthesises group ids `g0`/`g1`/… in the same
  `NodeId` space as user-authored service ids, so a service literally named `g0` overwrites the first
  group (breaks layout boxes, hit-test, two-way edits). Use a distinct branded id / collision-proof
  internal prefix. *(P1, open.)*
- **Malformed `icon "…"` refs silently nulled.** net/block/cloud parsers convert a bad icon ref to
  `null`, so user intent vanishes and a default glyph renders — violates the repo's fail-loudly
  contract. `parseIconRef` should return `Result` and fail the parse. *(P1, open.)*

Checked while adding the optional C4 element description.

Checked while adding the state-diagram parser.

Checked while adding composite states.

Checked while fixing the empty/truncated-source crash (EOF parse position).

Checked while adding the ER-diagram parser.
Checked while adding the cross-family malformed-input robustness suite (no crashes found).
