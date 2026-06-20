// Refined numeric scalars: like `Length` (finite, non-negative), these push a value's invariant into
// the type so an invalid one is unconstructible and downstream code needn't re-check it. Constructors
// (which validate and `brand`) live in the shell; cores call them.

import type { Brand } from "./brand.js";

// A finite number strictly greater than zero — e.g. a pie slice's share of the whole.
export type Positive = Brand<number, "Positive">;

// A finite integer ≥ 1 — e.g. a grid column count (zero columns has no meaning and divides by zero).
export type PositiveInt = Brand<number, "PositiveInt">;

// A list with at least two elements — e.g. an edge's waypoints (you can't draw a segment with fewer).
// `[0]`/`[1]` are total (the tuple's required slots), so consumers needn't guard a too-short list, and
// it's structurally a `readonly T[]`, so anything reading the list as one still works. The `twoOrMore`
// constructor (shell) builds it from an explicit first + second + rest, so no unsafe assertion is needed.
export type TwoOrMore<T> = readonly [T, T, ...(readonly T[])];
