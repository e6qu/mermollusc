# @m/parser — do next

- Attach source spans (token offsets) to AST so the builder can patch text ranges (two-way sync).
- Add property-based round-trip tests (fast-check) over generated flowchart ASTs.
- Surface error positions (line/col) in `ParseError`, not just messages.
- Grow the subset: `subgraph`, stadium `([])` / circle `(())` shapes, quoted labels, more link styles.
- Add grammars for the other families (sequence, C4, block/network) as they land.
