# @m/std — do next

- (done) `stamp(level, module, event)` fills `ts` for callers; consider a `Clock` injection if
  deterministic timestamps are ever needed in tests.
- (done) `assertNever`, `andThen`, `traverse`; `length()` rejects non-finite.
- **Follow-ups from the type-system-hardening pass** (scoped out of that PR because each ripples
  through shared `@m/contracts` types and so wants its own green pass):
  - **Refined-number brands** for the invariants currently defended only at runtime: a
    finite-non-negative offset/`TextSpan` (the parser already `Number.isFinite`-filters a NaN EOF
    offset), a positive `PieSlice.value`, a `≥1 BlockAst.columns`, and a 0/1/2 tuple for
    `GitCommit.parents`. Each becomes a smart constructor that makes the bad value unconstructible.
  - **`TwoOrMore<T>` for `SceneEdge.waypoints`** (always ≥2 in reality) minted at the layout shell
    boundary — deletes the `< 2` guards in `display.ts`/`main.ts` and makes `[0]`/`[1]` total. Needs
    the elk path to fail the layout `Result` (not silently skip) on a degenerate <2-point route.
  - **Full scene/screen coordinate branding.** This pass unified the transform into one `sceneToScreen`
    pair; full type-enforcement (so a screen `Point` can't be passed where a scene one is wanted) means
    branding `Point`/`Coordinate` per space in `@m/std`/`@m/contracts` — a broad ripple deferred here.
