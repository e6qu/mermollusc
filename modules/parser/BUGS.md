# @m/parser — bugs

Open (collab-era audit sweep):

- **Printer doesn't escape special chars or empty labels.** `print.ts` emits a flowchart node label
  verbatim, so a label containing a closing delimiter (`A[x]y]`) or an empty label (`A(())`) produces
  markup the parser then rejects — i.e. `parse(print(ast))` doesn't round-trip for some valid ASTs.
  The round-trip property test masks this by restricting the label alphabet. Fix: emit a quoted/escaped
  label, and the bare id (or a quoted empty) when the label is empty. Low impact today (the two-way
  edit path uses span patching, not `print`), but a real latent correctness gap.

Resolved (internal audit sweep, 2026-06-20):

- ~~**Requirement: unknown verb silently dropped.**~~ Fixed — `req-parse` now returns a located `err`
  for an unrecognised relationship verb (was a silent `continue`, contradicting its own comment).
- ~~**ER: duplicate attribute block overwrote the first.**~~ Fixed — multiple `ENTITY { … }` blocks for
  one entity now merge (append), like Mermaid.
- ~~**Block: quoted pipe edge label kept its quotes.**~~ Fixed — uses `cleanLabel`, matching node labels
  and the recorded span.
- ~~**DOT: `style` value compared case-sensitively.**~~ Fixed — lowercased before matching.
- ~~**Mindmap: relabel span found the wrong occurrence**~~ when an id repeated the label text — the
  search now starts at the shape delimiter.

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
