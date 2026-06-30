# @m/parser — bugs

Withdrawn (collab-era audit sweep — verified false against source):

- ~~**Printer doesn't escape special chars or empty labels.**~~ An audit reviewer flagged that
  `print(parse(text))` could fail to round-trip on empty / delimiter-bearing labels. Verified against
  the parser: it **rejects** `A(())` and `A[]` (empty labels don't parse) and never yields a label with
  an unescaped delimiter — so no AST the parser produces can trigger the case. The round-trip property
  test's restricted alphabet is therefore correct, not a mask. (`print` is also currently unused outside
  its own test.) No fix needed.

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

Checked while adding state-note side parsing and the pie donut header modifier.
Checked while adding the cross-family malformed-input robustness suite (no crashes found).

Checked while centralising the CST adapter (`cst.ts`), the forward header-sniff scan, the O(S) subgraph
ordering walk, and `parseDiagramWithSource` — all behaviour-preserving; existing + new parity tests pass.

Checked while adding Gantt full start-field source spans.

Checked while preserving DOT `style=rounded` through import so repeated export/import is stable.

Checked while adding state diagram direction parsing.
