import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  ClassArrow,
  FlowStyle,
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
import { singleStyleTarget } from "./style-spans.js";

export interface ParsedClass {
  readonly ast: ClassAst;
  readonly source: ClassSource;
}

const tokenSpan = (t: IToken): TextSpan => ({
  start: t.startOffset,
  end: t.startOffset + t.image.length,
});
// A relationship label captures the whole post-`:` text, possibly quoted; strip the quotes and point
// the edit span at the inner text (the class multiplicities are already unquoted two lines below).
const relLabel = (t: IToken): { readonly text: string; readonly span: TextSpan } => {
  const trimmed = t.image.trim();
  const start = t.startOffset + (t.image.length - t.image.trimStart().length);
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? { text: trimmed.slice(1, -1), span: { start: start + 1, end: start + trimmed.length - 1 } }
    : { text: trimmed, span: { start, end: start + trimmed.length } };
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

// Mermaid generics: `List~T~` / `Map~K,V~` → `List<T>` / `Map<K,V>` for display (ids keep the raw
// `~…~` form so relationship endpoints still match).
const generics = (s: string): string => s.replace(/~([^~]+)~/g, "<$1>");

// One member line. Stereotype lines (`<<interface>>`) and blanks yield null (skipped). A `()` in the
// text marks a method; the leading visibility glyph, when present, is split off.
const memberOf = (raw: string): ClassMember | null => {
  const t = raw.trim();
  if (t === "" || t.startsWith("<<")) return null;
  const head = t.slice(0, 1);
  const visibility = visOf(head);
  const text = generics((visibility === null ? t : t.slice(1)).trim());
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
// A `<<interface>>` / `<<abstract>>` stereotype line inside a class body; captures the inner text.
const STEREOTYPE = /^<<\s*(.+?)\s*>>$/;

const buildResult = (cst: CstNode): Result<ParsedClass, ParseError> => {
  const labels = new Map<string, string>(); // class id → label, first-mention order
  const membersById = new Map<string, ClassMember[]>();
  const stereoById = new Map<string, string>(); // class id → `<<stereotype>>` inner text
  const entitySpans = new Map<ClassEntityId, TextSpan>();
  const relationships: ClassRel[] = [];
  const relSpans = new Map<ClassRelId, TextSpan>();
  const styles: FlowStyle[] = [];
  const styleSpans = new Map<ClassEntityId, TextSpan>();
  // `:::name` on a class ref → a synthesised `class <id> <name>` assignment (as everywhere else).
  const assign = (id: string, shorthand: IToken | undefined): void => {
    if (shorthand !== undefined)
      styles.push({ kind: "class", raw: `class ${id} ${shorthand.image.slice(3)}` });
  };

  const see = (id: string, span: TextSpan): void => {
    if (!labels.has(id)) labels.set(id, generics(id));
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
    const styleDir = childNodes(stmt.children, "classStyleDirective")[0];
    if (styleDir !== undefined) {
      const st = childTokens(styleDir.children, "ClassStyleStmt")[0];
      const cd = childTokens(styleDir.children, "ClassClassDefStmt")[0];
      const ls = childTokens(styleDir.children, "ClassLinkStyleStmt")[0];
      if (st !== undefined) {
        styles.push({ kind: "style", raw: st.image.trim() });
        const single = singleStyleTarget(st, "style");
        if (single !== null) {
          styleSpans.set(brand<string, "ClassEntityId">(single.target), single.span);
        }
      } else if (cd !== undefined) styles.push({ kind: "classDef", raw: cd.image.trim() });
      else if (ls !== undefined) styles.push({ kind: "linkStyle", raw: ls.image.trim() });
      continue;
    }

    const css = childNodes(stmt.children, "classCssClassDecl")[0];
    if (css !== undefined) {
      // `cssClass "A,B" name` → a `class` assignment per quoted target.
      const quoted = childTokens(css.children, "ClassQuotedString")[0];
      const nameTok = childTokens(css.children, "ClassIdentifier")[0];
      if (quoted !== undefined && nameTok !== undefined) {
        for (const target of quoted.image.slice(1, -1).split(",")) {
          const t = target.trim();
          if (t !== "") styles.push({ kind: "class", raw: `class ${t} ${nameTok.image}` });
        }
      }
      continue;
    }

    const decl = childNodes(stmt.children, "classDecl")[0];
    if (decl !== undefined) {
      const name = childTokens(decl.children, "ClassIdentifier")[0];
      if (name === undefined) continue;
      see(name.image, tokenSpan(name));
      assign(name.image, childTokens(decl.children, "ClassShorthand")[0]);
      const stereoTok = childTokens(decl.children, "ClassStereotype")[0];
      if (stereoTok !== undefined) {
        const inner = stereoTok.image.slice(2, -2).trim();
        stereoById.set(name.image, inner);
      }
      const block = childNodes(decl.children, "classBlock")[0];
      if (block !== undefined) {
        const members: ClassMember[] = [];
        for (const t of childTokens(block.children, "ClassMemberText")) {
          const stereo = STEREOTYPE.exec(t.image.trim());
          if (stereo !== null) {
            stereoById.set(name.image, stereo[1] ?? "");
            continue;
          }
          const m = memberOf(t.image);
          if (m !== null) members.push(m);
        }
        addMembers(name.image, members);
      }
      continue;
    }

    const stDecl = childNodes(stmt.children, "classStereotypeDecl")[0];
    if (stDecl !== undefined) {
      const stereoTok = childTokens(stDecl.children, "ClassStereotype")[0];
      const name = childTokens(stDecl.children, "ClassIdentifier")[0];
      if (stereoTok !== undefined && name !== undefined) {
        const inner = stereoTok.image.slice(2, -2).trim();
        stereoById.set(name.image, inner);
        see(name.image, tokenSpan(name));
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
    const labelInfo = label === undefined ? null : relLabel(label);
    const relTok = childTokens(rm.children, "ClassRelationship")[0];
    // `Foo:::hot` / `Foo:::hot --> Bar:::cold` — a `:::` belongs to the endpoint on its side of the
    // operator (by source offset), so a right-only `:::` isn't mis-assigned to the left class.
    const shorthands = childTokens(rm.children, "ClassShorthand");
    assign(
      left.image,
      relTok === undefined
        ? shorthands[0]
        : shorthands.find((s) => s.startOffset < relTok.startOffset),
    );
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
    assign(
      right.image,
      shorthands.find((s) => s.startOffset > relTok.startOffset),
    );
    const parts = REL.exec(relTok.image);
    if (parts === null) continue;
    const [, leftSym = "", line = "", rightSym = ""] = parts;
    // Per-end multiplicity: a quoted string before the operator is the `from` end, after it the `to`.
    const quotes = childTokens(rm.children, "ClassQuotedString");
    const fromMultTok = quotes.find((q) => q.startOffset < relTok.startOffset);
    const toMultTok = quotes.find((q) => q.startOffset > relTok.startOffset);
    const id = brand<string, "ClassRelId">(`r${relationships.length}`);
    relationships.push({
      id,
      from: brand<string, "ClassEntityId">(left.image),
      to: brand<string, "ClassEntityId">(right.image),
      fromArrow: leftArrow(leftSym),
      toArrow: rightArrow(rightSym),
      dashed: line === "..",
      label: labelInfo === null ? "" : labelInfo.text,
      fromMult: fromMultTok === undefined ? "" : fromMultTok.image.slice(1, -1),
      toMult: toMultTok === undefined ? "" : toMultTok.image.slice(1, -1),
    });
    if (labelInfo !== null) relSpans.set(id, labelInfo.span);
  }

  const entities: ClassEntity[] = [...labels].map(([id, label]) => ({
    id: brand<string, "ClassEntityId">(id),
    label,
    stereotype: stereoById.get(id) ?? null,
    members: membersById.get(id) ?? [],
  }));
  return ok({
    ast: { kind: "class", entities, relationships, styles },
    source: { entities: entitySpans, relationships: relSpans, styleSpans },
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
