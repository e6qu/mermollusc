import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  ClassArrow,
  ClassAst,
  ClassEntity,
  ClassEntityId,
  ClassMember,
  ClassRel,
  ClassRelId,
  ClassSource,
  ClassVisibility,
  TextSpan,
} from "@m/contracts";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { classParser } from "./class-grammar.js";
import { classLexer } from "./class-tokens.js";

export interface ParsedClass {
  readonly ast: ClassAst;
  readonly source: ClassSource;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];

const tokenSpan = (t: IToken): TextSpan => ({
  start: t.startOffset,
  end: t.startOffset + t.image.length,
});
const trimmedSpan = (t: IToken): TextSpan => {
  const lead = t.image.length - t.image.trimStart().length;
  const start = t.startOffset + lead;
  return { start, end: start + t.image.trim().length };
};

const visOf = (ch: string): ClassVisibility | null => {
  switch (ch) {
    case "+":
      return "public";
    case "-":
      return "private";
    case "#":
      return "protected";
    case "~":
      return "package";
    default:
      return null;
  }
};

// One member line. Stereotype lines (`<<interface>>`) and blanks yield null (skipped). A `()` in the
// text marks a method; the leading visibility glyph, when present, is split off.
const memberOf = (raw: string): ClassMember | null => {
  const t = raw.trim();
  if (t === "" || t.startsWith("<<")) return null;
  const head = t.slice(0, 1);
  const visibility = visOf(head);
  const text = (visibility === null ? t : t.slice(1)).trim();
  if (text === "") return null;
  return { visibility, text, kind: text.includes("(") ? "method" : "field" };
};

const leftArrow = (s: string): ClassArrow => {
  switch (s) {
    case "<|":
      return "triangle";
    case "<":
      return "arrowOpen";
    case "*":
      return "diamondFilled";
    case "o":
      return "diamondHollow";
    default:
      return "none";
  }
};
const rightArrow = (s: string): ClassArrow => {
  switch (s) {
    case "|>":
      return "triangle";
    case ">":
      return "arrowOpen";
    case "*":
      return "diamondFilled";
    case "o":
      return "diamondHollow";
    default:
      return "none";
  }
};
const REL = /^(<\||<|\*|o)?(--|\.\.)(\|>|>|\*|o)?$/;

const buildResult = (cst: CstNode): Result<ParsedClass, ParseError> => {
  const labels = new Map<string, string>(); // class id → label, first-mention order
  const membersById = new Map<string, ClassMember[]>();
  const entitySpans = new Map<ClassEntityId, TextSpan>();
  const relationships: ClassRel[] = [];
  const relSpans = new Map<ClassRelId, TextSpan>();

  const see = (id: string, span: TextSpan): void => {
    if (!labels.has(id)) labels.set(id, id);
    const key = brand<string, "ClassEntityId">(id);
    if (!entitySpans.has(key)) entitySpans.set(key, span);
  };
  const addMembers = (id: string, ms: readonly ClassMember[]): void => {
    if (ms.length === 0) return;
    const cur = membersById.get(id) ?? [];
    cur.push(...ms);
    membersById.set(id, cur);
  };

  for (const stmt of childNodes(cst.children, "classStatement")) {
    const decl = childNodes(stmt.children, "classDecl")[0];
    if (decl !== undefined) {
      const name = childTokens(decl.children, "ClassIdentifier")[0];
      if (name === undefined) continue;
      see(name.image, tokenSpan(name));
      const block = childNodes(decl.children, "classBlock")[0];
      if (block !== undefined) {
        const members = childTokens(block.children, "ClassMemberText").reduce<ClassMember[]>(
          (acc, t) => {
            const m = memberOf(t.image);
            if (m !== null) acc.push(m);
            return acc;
          },
          [],
        );
        addMembers(name.image, members);
      }
      continue;
    }

    const rm = childNodes(stmt.children, "classRelOrMember")[0];
    if (rm === undefined) continue;
    const ids = childTokens(rm.children, "ClassIdentifier");
    const left = ids[0];
    if (left === undefined) continue;
    see(left.image, tokenSpan(left));
    const label = childTokens(rm.children, "ClassLabelText")[0];
    const relTok = childTokens(rm.children, "ClassRelationship")[0];
    if (relTok === undefined) {
      // `Foo : +member` shorthand — the label text is one member of Foo.
      if (label !== undefined) {
        const m = memberOf(label.image);
        if (m !== null) addMembers(left.image, [m]);
      }
      continue;
    }
    const right = ids[1];
    if (right === undefined) continue;
    see(right.image, tokenSpan(right));
    const parts = REL.exec(relTok.image);
    if (parts === null) continue;
    const [, leftSym = "", line = "", rightSym = ""] = parts;
    const id = brand<string, "ClassRelId">(`r${relationships.length}`);
    relationships.push({
      id,
      from: brand<string, "ClassEntityId">(left.image),
      to: brand<string, "ClassEntityId">(right.image),
      fromArrow: leftArrow(leftSym),
      toArrow: rightArrow(rightSym),
      dashed: line === "..",
      label: label === undefined ? "" : label.image.trim(),
    });
    if (label !== undefined) relSpans.set(id, trimmedSpan(label));
  }

  const entities: ClassEntity[] = [...labels].map(([id, label]) => ({
    id: brand<string, "ClassEntityId">(id),
    label,
    members: membersById.get(id) ?? [],
  }));
  return ok({
    ast: { kind: "class", entities, relationships },
    source: { entities: entitySpans, relationships: relSpans },
  });
};

export const parseClassWithSource = (text: string): Result<ParsedClass, ParseError> => {
  const lexed = classLexer.tokenize(text);
  if (lexed.errors.length > 0) return err(lexingError(lexed.errors));
  classParser.input = lexed.tokens;
  const cst = classParser.classDiagram();
  if (classParser.errors.length > 0) return err(recognitionError(classParser.errors));
  return buildResult(cst);
};

export const parseClass = (text: string): Result<ClassAst, ParseError> =>
  map(parseClassWithSource(text), (parsed) => parsed.ast);
