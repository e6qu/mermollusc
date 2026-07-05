import type { CstNode } from "chevrotain";
import { childTokens } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  FlowStyle,
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
import { CLASSDEF_STMT, LINKSTYLE_STMT, STYLE_STMT } from "./style-patterns.js";

// The mindmap lexer captures each line whole, so a styling directive would otherwise become a node.
// These match only the colon-bearing directives (`classDef`/`style`/`linkStyle`) anchored at the line
// start — each requires a `prop:` so it can't be confused with node text. Class ASSIGNMENT in a mindmap
// is the inline `:::name` suffix (below), not a bare `class id name`, so that form isn't matched here.
const LINE_CLASSDEF = new RegExp(`^(?:${CLASSDEF_STMT.source})`);
const LINE_STYLE = new RegExp(`^(?:${STYLE_STMT.source})`);
const LINE_LINKSTYLE = new RegExp(`^(?:${LINKSTYLE_STMT.source})`);

const styleLineOf = (line: string): FlowStyle | null => {
  if (LINE_CLASSDEF.test(line)) return { kind: "classDef", raw: line };
  if (LINE_STYLE.test(line)) return { kind: "style", raw: line };
  if (LINE_LINKSTYLE.test(line)) return { kind: "linkStyle", raw: line };
  return null;
};

// The inline `:::className` on a node, e.g. `Root:::urgent`.
const INLINE_CLASS = /:::([A-Za-z0-9_-]+)/;

export interface ParsedMindmap {
  readonly ast: MindmapAst;
  readonly source: MindmapSource;
}

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
  const styles: FlowStyle[] = [];
  const spans = new Map<MindmapNodeId, TextSpan>();
  // Per node: the span of its inline `:::className` (to rewrite/remove its colour class), or a zero-width
  // span at the end of the node text (the insertion point when it has none). Lets the editor colour a
  // mindmap node in the source despite its id being generated.
  const classSpans = new Map<MindmapNodeId, TextSpan>();
  const stack: Frame[] = [];

  for (const tok of lines) {
    // A styling directive is not a node (and doesn't affect the indentation tree).
    const styleLine = styleLineOf(tok.image.trim());
    if (styleLine !== null) {
      styles.push(styleLine);
      continue;
    }
    const col = tok.startColumn ?? 1;
    const { label, shape } = nodeTextOf(tok.image);
    const id = brand<string, "MindmapNodeId">(`n${nodes.length}`);
    // An inline `:::className` assigns this node to a class; the node id is generated, so synthesise the
    // assignment against that id (the class colour is resolved by node id, as everywhere else).
    const inline = tok.image.match(INLINE_CLASS);
    if (inline !== null) styles.push({ kind: "class", raw: `class ${id} ${inline[1]}` });
    if (inline !== null && inline.index !== undefined) {
      const start = tok.startOffset + inline.index;
      classSpans.set(id, { start, end: start + inline[0].length });
    } else {
      const end = tok.startOffset + tok.image.trimEnd().length;
      classSpans.set(id, { start: end, end });
    }
    // Pop ancestors at the same or deeper indentation: the nearest strictly-shallower node is parent.
    while (stack.length > 0 && (stack[stack.length - 1]?.col ?? 0) >= col) stack.pop();
    const top = stack[stack.length - 1];
    const parent = top === undefined ? null : top.id;
    nodes.push({ id, label, shape, parent, level: stack.length });
    // Locate the label inside the line for its relabel span. A shaped node's text sits after the
    // opening delimiter, so search from there — otherwise an id/prefix that repeats the label text
    // (e.g. `aa(aa)`) would point the span at the wrong occurrence.
    const delim = [tok.image.indexOf("("), tok.image.indexOf("["), tok.image.indexOf("{")].filter(
      (i) => i >= 0,
    );
    const searchFrom = delim.length > 0 ? Math.min(...delim) : 0;
    const idx = label === "" ? -1 : tok.image.indexOf(label, searchFrom);
    if (idx >= 0)
      spans.set(id, { start: tok.startOffset + idx, end: tok.startOffset + idx + label.length });
    stack.push({ col, id });
  }

  return ok({ ast: { kind: "mindmap", nodes, styles }, source: { nodes: spans, classSpans } });
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
