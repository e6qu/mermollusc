import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import { brand, err, map, ok, positive, type Result } from "@m/std";
import type { PieAst, PieSlice, PieSliceId, PieSource, TextSpan } from "@m/contracts";
import { lexingError, parseErrorAt, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { pieParser } from "./pie-grammar.js";
import { pieLexer } from "./pie-tokens.js";

export interface ParsedPie {
  readonly ast: PieAst;
  readonly source: PieSource;
}

const unquote = (s: string): string => s.slice(1, -1);
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

const buildResult = (cst: CstNode): Result<ParsedPie, ParseError> => {
  const root = cst.children;
  const showData = childTokens(root, "ShowData").length > 0;
  const donut = childTokens(root, "Donut").length > 0;
  let title: string | null = null;
  const slices: PieSlice[] = [];
  const sliceSpans = new Map<PieSliceId, TextSpan>();

  for (const stmt of childNodes(root, "titleLine")) {
    const text = childTokens(stmt.children, "TitleText")[0];
    if (text !== undefined) title = text.image.trim();
  }

  for (const row of childNodes(root, "row")) {
    const labelTok = childTokens(row.children, "QuotedString")[0];
    const numTok = childTokens(row.children, "NumberLit")[0];
    if (labelTok === undefined || numTok === undefined) continue;
    const value = Number(numTok.image);
    // The lexer only matches a non-negative numeric literal, so a negative can't reach here; zero can,
    // and a zero/blank slice is meaningless in a pie, so reject it loudly (matching Mermaid).
    if (!(value > 0)) {
      return err(
        parseErrorAt(
          "pie: slice value must be greater than zero",
          numTok.startOffset,
          numTok.image.length,
        ),
      );
    }
    const id = brand<string, "PieSliceId">(`s${slices.length}`);
    slices.push({ id, label: unquote(labelTok.image), value: positive(value) });
    sliceSpans.set(id, innerSpan(labelTok));
  }

  return ok({
    ast: { kind: "pie", title, showData, donut, slices },
    source: { slices: sliceSpans },
  });
};

export const parsePieWithSource = (text: string): Result<ParsedPie, ParseError> => {
  const lexed = pieLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  pieParser.input = lexed.tokens;
  const cst = pieParser.pie();
  if (pieParser.errors.length > 0) {
    return err(recognitionError(pieParser.errors));
  }
  return buildResult(cst);
};

export const parsePie = (text: string): Result<PieAst, ParseError> =>
  map(parsePieWithSource(text), (parsed) => parsed.ast);
