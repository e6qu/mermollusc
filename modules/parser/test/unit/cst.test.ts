import type { CstElement, CstNode, IToken } from "chevrotain";
import fc from "fast-check";
import type { TextSpan } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { childNodes, childTokens, imageOf, spanOf } from "../../src/shell/cst.js";
import type { Children } from "../../src/shell/cst.js";
import { lexer } from "../../src/shell/tokens.js";

// Genuine `IToken`s from the real flowchart lexer — so the parity check runs against the same token
// surface the parsers see, not a fabricated stand-in.
const realTokens = (text: string): IToken[] => {
  const lexed = lexer.tokenize(text);
  expect(lexed.errors).toHaveLength(0);
  return lexed.tokens;
};

// The inline expressions the centralised helpers replaced across the 16 parse files.
const inlineTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const inlineNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const inlineImage = (c: Children, name: string): string | null =>
  inlineTokens(c, name)[0]?.image ?? null;
const inlineSpan = (t: IToken): TextSpan => ({
  start: t.startOffset,
  end: (t.endOffset ?? t.startOffset) + 1,
});

const fakeNode = (name: string): CstNode => ({ name, children: {} });

describe("cst helpers — parity with the inline expressions they replaced", () => {
  it("childTokens / childNodes / imageOf match the old `?? [] as …` casts on arbitrary dicts", () => {
    const tokens = realTokens("flowchart TD\n  A[Start] --> B(End)\n");
    fc.assert(
      fc.property(
        // A synthetic `children` dict mixing present token slots, present node slots, and absent keys.
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 4 }),
          fc.oneof(
            fc.constant<CstElement[] | undefined>(undefined),
            fc
              .subarray(tokens, { minLength: 0, maxLength: tokens.length })
              .map((ts): CstElement[] => [...ts]),
            fc
              .array(fc.string({ maxLength: 3 }), { maxLength: 3 })
              .map((ns): CstElement[] => ns.map(fakeNode)),
          ),
        ),
        fc.string({ minLength: 1, maxLength: 4 }),
        (c: Children, name) => {
          expect(childTokens(c, name)).toEqual(inlineTokens(c, name));
          expect(childNodes(c, name)).toEqual(inlineNodes(c, name));
          expect(imageOf(c, name)).toEqual(inlineImage(c, name));
        },
      ),
    );
  });

  it("spanOf matches the old start/endOffset span on every real token", () => {
    const tokens = realTokens("flowchart LR\n  A([round]) -->|lbl| B((C))\n  subgraph S\n  D\n  end\n");
    for (const t of tokens) expect(spanOf(t)).toEqual(inlineSpan(t));
  });
});
