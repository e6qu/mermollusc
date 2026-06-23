import type { CstElement, CstNode, IToken } from "chevrotain";
import type { TextSpan } from "@m/contracts";

// Shell adapter for reading a Chevrotain CST node's `children` dict. Chevrotain types `children` as a
// `Record<string, (IToken | CstNode)[] | undefined>` keyed by grammar label, and resolves the element
// type per label only at runtime. These helpers centralise the two sanctioned `as` casts that recover
// the concrete element type a grammar rule guarantees (a labelled slot holds either tokens or nodes,
// never a mix). An absent label yields `[]` — the correct value for an optional child that didn't
// match, so callers' `.length`/`.map` stay total. Cast through here, never inline at the call sites.

export type Children = Record<string, CstElement[] | undefined>;

export const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];

export const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];

export const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;

export const spanOf = (t: IToken): TextSpan => ({
  start: t.startOffset,
  end: (t.endOffset ?? t.startOffset) + 1,
});
