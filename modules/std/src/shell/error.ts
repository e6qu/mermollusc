// Narrows an unknown caught value to a human-readable message: an `Error`'s `.message`, otherwise a
// `String()` form. Shell-only — the core forbids `unknown` and never catches. It surfaces the value
// loudly (no swallowing): every branch yields a non-empty string a logger or `LayoutError` can carry.
export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
