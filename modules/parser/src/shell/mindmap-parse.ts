import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  MindmapAst,
  MindmapNode,
  MindmapNodeId,
  MindmapShape,
  MindmapSource,
  TextSpan,
} from "@m/contracts";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { mindmapParser } from "./mindmap-grammar.js";
import { mindmapLexer } from "./mindmap-tokens.js";

export interface ParsedMindmap {
  readonly ast: MindmapAst;
  readonly source: MindmapSource;
}

type Children = Record<string, CstElement[] | undefined>;
const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];

// `id` (ignored — mindmap nodes aren't cross-referenced) optionally precedes a shape delimiter; the
// inner text is the label. The circle `((…))` alternative must precede the rounded `(…)` one.
const SHAPE_RE =
  /^[A-Za-z0-9_-]*(?:\(\(([\s\S]*)\)\)|\(([\s\S]*)\)|\[([\s\S]*)\]|\{\{([\s\S]*)\}\})$/;

interface NodeText {
  readonly label: string;
  readonly shape: MindmapShape;
}

// Strips the `::icon(...)` / `:::class` decorations (parsed but unsupported — no icon pack here), then
// reads the shape from the surrounding delimiter, falling back to a plain rounded node.
const nodeTextOf = (raw: string): NodeText => {
  const cleaned = raw
    .replace(/::icon\([^)]*\)/g, "")
    .replace(/:::[A-Za-z0-9_-]+/g, "")
    .trim();
  const m = cleaned.match(SHAPE_RE);
  if (m !== null) {
    if (m[1] !== undefined) return { label: m[1].trim(), shape: "circle" };
    if (m[2] !== undefined) return { label: m[2].trim(), shape: "rounded" };
    if (m[3] !== undefined) return { label: m[3].trim(), shape: "square" };
    if (m[4] !== undefined) return { label: m[4].trim(), shape: "hexagon" };
  }
  return { label: cleaned, shape: "default" };
};

interface Frame {
  readonly col: number;
  readonly id: MindmapNodeId;
}

const buildResult = (cst: CstNode): Result<ParsedMindmap, ParseError> => {
  const lines = childTokens(cst.children, "LineText");
  const nodes: MindmapNode[] = [];
  const spans = new Map<MindmapNodeId, TextSpan>();
  const stack: Frame[] = [];

  for (const tok of lines) {
    const col = tok.startColumn ?? 1;
    const { label, shape } = nodeTextOf(tok.image);
    const id = brand<string, "MindmapNodeId">(`n${nodes.length}`);
    // Pop ancestors at the same or deeper indentation: the nearest strictly-shallower node is parent.
    while (stack.length > 0 && (stack[stack.length - 1]?.col ?? 0) >= col) stack.pop();
    const top = stack[stack.length - 1];
    const parent = top === undefined ? null : top.id;
    nodes.push({ id, label, shape, parent, level: stack.length });
    const idx = label === "" ? -1 : tok.image.indexOf(label);
    if (idx >= 0)
      spans.set(id, { start: tok.startOffset + idx, end: tok.startOffset + idx + label.length });
    stack.push({ col, id });
  }

  return ok({ ast: { kind: "mindmap", nodes }, source: { nodes: spans } });
};

export const parseMindmapWithSource = (text: string): Result<ParsedMindmap, ParseError> => {
  const lexed = mindmapLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  mindmapParser.input = lexed.tokens;
  const cst = mindmapParser.mindmap();
  if (mindmapParser.errors.length > 0) {
    return err(recognitionError(mindmapParser.errors));
  }
  return buildResult(cst);
};

export const parseMindmap = (text: string): Result<MindmapAst, ParseError> =>
  map(parseMindmapWithSource(text), (parsed) => parsed.ast);
