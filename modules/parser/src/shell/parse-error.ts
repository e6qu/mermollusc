import type { ILexingError, IRecognitionException } from "chevrotain";

// Where in the source text a parse failure points, so a host can highlight the offending range.
// `offset` is the 0-based character index; `length` the span width (≥1). Line/column are left to
// the host to derive from the text, keeping this independent of how the editor counts lines.
export interface ErrorPosition {
  readonly offset: number;
  readonly length: number;
}

export interface ParseError {
  readonly kind: "parse";
  readonly errors: readonly string[];
  readonly positions: readonly ErrorPosition[];
}

// A failure with no located token — a structural/semantic check rather than a lexer/parser miss.
export const parseError = (errors: readonly string[]): ParseError => ({
  kind: "parse",
  errors,
  positions: [],
});

export const lexingError = (errors: readonly ILexingError[]): ParseError => ({
  kind: "parse",
  errors: errors.map((e) => e.message),
  positions: errors.map((e) => ({ offset: e.offset, length: e.length })),
});

export const recognitionError = (errors: readonly IRecognitionException[]): ParseError => ({
  kind: "parse",
  errors: errors.map((e) => e.message),
  // Chevrotain's EOF token (an "unexpected end of input" error) has a NaN `startOffset` — it can't be
  // located, so drop it from `positions` rather than emit a bogus offset. The message still surfaces;
  // `positions` is just the locatable subset.
  positions: errors
    .filter((e) => Number.isFinite(e.token.startOffset))
    .map((e) => ({ offset: e.token.startOffset, length: Math.max(1, e.token.image.length) })),
});
