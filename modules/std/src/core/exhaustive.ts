// Compile-time exhaustiveness guard for closed unions. Put `return assertNever(x)` in a switch's
// default (or after an if/else chain): if every variant is handled, `x` narrows to `never` and this
// type-checks; if a new variant is added, `x` is no longer `never` and the call is a compile error —
// so a new diagram family (or shape, edge kind, …) can never be silently misrouted. The throw only
// fires if a value reaches it at runtime despite the types (e.g. unchecked external input), and is a
// loud failure, not a fallback.
export const assertNever = (x: never): never => {
  throw new Error(`unreachable: unhandled variant ${JSON.stringify(x)}`);
};
