import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  ErAst,
  FlowStyle,
  ErAttribute,
  ErCardinality,
  ErEntity,
  ErEntityId,
  ErKey,
  ErRelationship,
  ErRelId,
  ErSource,
  TextSpan,
} from "@m/contracts";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { erParser } from "./er-grammar.js";
import { erLexer } from "./er-tokens.js";

export interface ParsedEr {
  readonly ast: ErAst;
  readonly source: ErSource;
}

const unquote = (s: string): string => s.slice(1, -1);

const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});
// A relationship label token captures the whole post-`:` text (`/[^\n]+/`), possibly with leading
// whitespace and surrounding quotes. Strip the quotes (as the endpoint labels already do) and point the
// edit span at the inner text, so the rendered label and the inline-relabel span both exclude the `"`.
const relLabel = (t: IToken): { readonly text: string; readonly span: TextSpan } => {
  const trimmed = t.image.trim();
  const start = t.startOffset + (t.image.length - t.image.trimStart().length);
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? { text: unquote(trimmed), span: { start: start + 1, end: start + trimmed.length - 1 } }
    : { text: trimmed, span: { start, end: start + trimmed.length } };
};

const LEFT_CARD: Record<string, ErCardinality> = {
  "||": "one",
  "|o": "zeroOrOne",
  "}|": "oneOrMany",
  "}o": "zeroOrMany",
};
const RIGHT_CARD: Record<string, ErCardinality> = {
  "||": "one",
  "o|": "zeroOrOne",
  "|{": "oneOrMany",
  "o{": "zeroOrMany",
};
const REL = /^(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)$/;

interface Endpoint {
  readonly id: string;
  readonly label: string;
  readonly span: TextSpan;
}

const isKey = (s: string): s is ErKey => s === "PK" || s === "FK" || s === "UK";

// `type name [keys…] ["comment"]`. The grammar guarantees the first two identifiers (type, name);
// remaining identifiers are keys, of which only PK/FK/UK are meaningful. Returns null only on the
// grammar-unreachable case of a block with fewer than two identifiers, so the row is skipped loudly
// rather than fabricated.
const attributeOf = (node: CstNode): ErAttribute | null => {
  const idents = childTokens(node.children, "ErIdentifier");
  const type = idents[0];
  const name = idents[1];
  if (type === undefined || name === undefined) return null;
  const keys = idents.slice(2).reduce<ErKey[]>((acc, t) => {
    if (isKey(t.image)) acc.push(t.image);
    return acc;
  }, []);
  const comment = childTokens(node.children, "ErQuotedString")[0];
  return {
    type: type.image,
    name: name.image,
    keys,
    comment: comment === undefined ? "" : unquote(comment.image),
  };
};

const endpointOf = (ep: CstNode): Endpoint | null => {
  const quoted = childTokens(ep.children, "ErQuotedString")[0];
  if (quoted !== undefined) {
    return { id: unquote(quoted.image), label: unquote(quoted.image), span: innerSpan(quoted) };
  }
  const id = childTokens(ep.children, "ErIdentifier")[0];
  if (id === undefined) return null;
  return {
    id: id.image,
    label: id.image,
    span: { start: id.startOffset, end: id.startOffset + id.image.length },
  };
};

const buildResult = (cst: CstNode): Result<ParsedEr, ParseError> => {
  const labels = new Map<string, string>(); // entity id → label, first-mention order
  const entitySpans = new Map<ErEntityId, TextSpan>();
  const attrsById = new Map<string, ErAttribute[]>(); // entity id → its attribute rows
  const relationships: ErRelationship[] = [];
  const relSpans = new Map<ErRelId, TextSpan>();

  const seeEntity = (e: Endpoint): void => {
    if (!labels.has(e.id)) labels.set(e.id, e.label);
    if (!entitySpans.has(brand<string, "ErEntityId">(e.id))) {
      entitySpans.set(brand<string, "ErEntityId">(e.id), e.span);
    }
  };

  for (const stmt of childNodes(cst.children, "erStatement")) {
    const endpoints = childNodes(stmt.children, "erEntity");
    const left = endpoints[0] === undefined ? null : endpointOf(endpoints[0]);
    if (left === null) continue;
    seeEntity(left);
    const block = childNodes(stmt.children, "erBlock")[0];
    if (block !== undefined) {
      const rows = childNodes(block.children, "erAttribute").reduce<ErAttribute[]>((acc, n) => {
        const a = attributeOf(n);
        if (a !== null) acc.push(a);
        return acc;
      }, []);
      // Mermaid merges multiple `ENTITY { … }` blocks for the same entity; append rather than replace.
      attrsById.set(left.id, [...(attrsById.get(left.id) ?? []), ...rows]);
    }
    const relTok = childTokens(stmt.children, "ErRelationship")[0];
    if (relTok === undefined) continue; // bare entity declaration or attribute block
    const right = endpoints[1] === undefined ? null : endpointOf(endpoints[1]);
    if (right === null) continue;
    seeEntity(right);
    const m = REL.exec(relTok.image);
    if (m === null) continue;
    const [, leftSym = "", line = "", rightSym = ""] = m;
    const id = brand<string, "ErRelId">(`r${relationships.length}`);
    const label = childTokens(stmt.children, "ErLabelText")[0];
    const labelInfo = label === undefined ? null : relLabel(label);
    relationships.push({
      id,
      from: brand<string, "ErEntityId">(left.id),
      to: brand<string, "ErEntityId">(right.id),
      fromCard: LEFT_CARD[leftSym] ?? "one",
      toCard: RIGHT_CARD[rightSym] ?? "one",
      identifying: line === "--",
      label: labelInfo === null ? "" : labelInfo.text,
    });
    if (labelInfo !== null) relSpans.set(id, labelInfo.span);
  }

  const styles: FlowStyle[] = [];
  for (const dir of childNodes(cst.children, "erStyleDirective")) {
    const st = childTokens(dir.children, "ErStyleStmt")[0];
    const cd = childTokens(dir.children, "ErClassDefStmt")[0];
    const cl = childTokens(dir.children, "ErClassStmt")[0];
    const ls = childTokens(dir.children, "ErLinkStyleStmt")[0];
    if (st !== undefined) styles.push({ kind: "style", raw: st.image.trim() });
    else if (cd !== undefined) styles.push({ kind: "classDef", raw: cd.image.trim() });
    else if (cl !== undefined) styles.push({ kind: "class", raw: cl.image.trim() });
    else if (ls !== undefined) styles.push({ kind: "linkStyle", raw: ls.image.trim() });
  }

  const entities: ErEntity[] = [...labels].map(([id, label]) => ({
    id: brand<string, "ErEntityId">(id),
    label,
    attributes: attrsById.get(id) ?? [],
  }));
  return ok({
    ast: { kind: "er", entities, relationships, styles },
    source: { entities: entitySpans, relationships: relSpans },
  });
};

export const parseErWithSource = (text: string): Result<ParsedEr, ParseError> => {
  const lexed = erLexer.tokenize(text);
  if (lexed.errors.length > 0) return err(lexingError(lexed.errors));
  erParser.input = lexed.tokens;
  const cst = erParser.er();
  if (erParser.errors.length > 0) return err(recognitionError(erParser.errors));
  return buildResult(cst);
};

export const parseEr = (text: string): Result<ErAst, ParseError> =>
  map(parseErWithSource(text), (parsed) => parsed.ast);
