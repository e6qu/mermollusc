// Refined numeric scalars: like `Length` (finite, non-negative), these push a value's invariant into
// the type so an invalid one is unconstructible and downstream code needn't re-check it. Constructors
// (which validate and `brand`) live in the shell; cores call them.

import type { Brand } from "./brand.js";

// A finite number strictly greater than zero — e.g. a pie slice's share of the whole.
export type Positive = Brand<number, "Positive">;

// A finite integer ≥ 1 — e.g. a grid column count (zero columns has no meaning and divides by zero).
export type PositiveInt = Brand<number, "PositiveInt">;
