# @m/parser — bugs

Open (external review, codex `gpt-5.5`, 2026-06-19):

- ~~**Cloud group id collision.**~~ Fixed — synthetic cloud group ids are now `group:N`; the `:` is
  outside the `CloudIdentifier` space (`[A-Za-z0-9_]+`) so a user service named `g0` can no longer
  collide with a group. (+ a parser regression test.)
- **Malformed `icon "…"` refs silently nulled.** net/block/cloud parsers convert a bad icon ref to
  `null`, so user intent vanishes and a default glyph renders — violates the repo's fail-loudly
  contract. `parseIconRef` should return `Result` and fail the parse. *(P1, open.)*

Checked while adding the optional C4 element description.

Checked while adding the state-diagram parser.

Checked while adding composite states.

Checked while fixing the empty/truncated-source crash (EOF parse position).

Checked while adding the ER-diagram parser.
Checked while adding the cross-family malformed-input robustness suite (no crashes found).
