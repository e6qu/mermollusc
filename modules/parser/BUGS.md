# @m/parser — bugs

Open (external review, codex `gpt-5.5`, 2026-06-19):

- ~~**Cloud group id collision.**~~ Fixed — synthetic cloud group ids are now `group:N`; the `:` is
  outside the `CloudIdentifier` space (`[A-Za-z0-9_]+`) so a user service named `g0` can no longer
  collide with a group. (+ a parser regression test.)
- ~~**Malformed `icon "…"` refs silently nulled.**~~ Fixed — a shared `iconRefOf` returns a `Result`;
  net/block/cloud now fail the parse with a located error (`parseErrorAt`, highlightable) instead of
  dropping a bad ref to `null` and rendering a default glyph. (Three `parseIconRef` copies removed;
  the three "ignores malformed icon" tests flipped to "fails loudly".)

Checked while adding the optional C4 element description.

Checked while adding the state-diagram parser.

Checked while adding composite states.

Checked while fixing the empty/truncated-source crash (EOF parse position).

Checked while adding the ER-diagram parser.
Checked while adding the cross-family malformed-input robustness suite (no crashes found).
