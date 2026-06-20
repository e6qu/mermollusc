# @m/std — do next

- (done) `stamp(level, module, event)` fills `ts` for callers; consider a `Clock` injection if
  deterministic timestamps are ever needed in tests.
- (done) `assertNever`, `andThen`, `traverse`; `length()` rejects non-finite.
- **Follow-ups from the type-system-hardening pass** (scoped out of that PR because each ripples
  through shared `@m/contracts` types and so wants its own green pass):
  - **Refined-number brands.** Done: `Positive`/`PositiveInt` brands wired to `PieSlice.value` and
    `BlockAst.columns`. Still open (deferred for ripple): a finite-non-negative offset/`TextSpan`
    (the parser already `Number.isFinite`-filters a NaN EOF offset — `TextSpan` threads through every
    source map, so it's the rippley one), and a `[] | [p] | [p, p]` tuple for `GitCommit.parents`
    (the merge construction filters a dynamic array, so the tuple needs explicit 0/1/2 branching).
  - **`TwoOrMore<T>` for `SceneEdge.waypoints`** (always ≥2 in reality) minted at the layout shell
    boundary — deletes the `< 2` guards in `display.ts`/`main.ts` and makes `[0]`/`[1]` total. Needs
    the elk path to fail the layout `Result` (not silently skip) on a degenerate <2-point route.
  - **Full scene/screen coordinate branding.** This pass unified the transform into one `sceneToScreen`
    pair; full type-enforcement (so a screen `Point` can't be passed where a scene one is wanted) means
    branding `Point`/`Coordinate` per space in `@m/std`/`@m/contracts` — a broad ripple deferred here.
