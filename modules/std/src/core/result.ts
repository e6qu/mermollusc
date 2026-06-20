export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

export const map = <T, E, U>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;

export const mapErr = <T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> =>
  r.ok ? r : err(f(r.error));

export const flatMap = <T, E, U>(r: Result<T, E>, f: (value: T) => Result<U, E>): Result<U, E> =>
  r.ok ? f(r.value) : r;

// `andThen` is `flatMap` under its more common name — sequence a fallible step after an ok value,
// short-circuiting on the first error.
export const andThen = flatMap;

// Map each item to a Result and collect, short-circuiting on the first error: the fallible `map`
// (`all(items.map(f))` without the intermediate array). Replaces a hand-rolled loop that pushes each
// value and early-returns the first err, so the propagation can't be got subtly wrong.
export const traverse = <T, U, E>(
  items: readonly T[],
  f: (item: T, index: number) => Result<U, E>,
): Result<readonly U[], E> => {
  const values: U[] = [];
  for (const [index, item] of items.entries()) {
    const r = f(item, index);
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
};

// Explicit caller-chosen default. Not a silent fallback — the caller opts in by name.
export const unwrapOr = <T, E>(r: Result<T, E>, whenErr: T): T => (r.ok ? r.value : whenErr);

// Collapse both branches to one type — total, so the caller must handle the error case.
export const match = <T, E, A>(
  r: Result<T, E>,
  onOk: (value: T) => A,
  onErr: (error: E) => A,
): A => (r.ok ? onOk(r.value) : onErr(r.error));

// Combine many Results into one: the first error short-circuits, else all values in order.
export const all = <T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> => {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
};

// Run a side effect on the ok value (e.g. logging at the shell) and pass the Result through unchanged.
export const tap = <T, E>(r: Result<T, E>, f: (value: T) => void): Result<T, E> => {
  if (r.ok) f(r.value);
  return r;
};
