// The runtime cast that mints a branded value lives in src/shell/brand.ts, never here.

declare const BRAND: unique symbol;

export type Brand<TBase, TTag extends string> = TBase & {
  readonly [BRAND]: TTag;
};
