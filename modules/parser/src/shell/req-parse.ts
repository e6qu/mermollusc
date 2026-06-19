import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  ReqEntity,
  ReqEntityId,
  ReqField,
  ReqKind,
  ReqRel,
  ReqRelId,
  ReqRelKind,
  RequirementAst,
  ReqSource,
  TextSpan,
} from "@m/contracts";
import { lexingError, parseErrorAt, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { reqParser } from "./req-grammar.js";
import { reqLexer } from "./req-tokens.js";

export interface ParsedRequirement {
  readonly ast: RequirementAst;
  readonly source: ReqSource;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];

const tokenSpan = (t: IToken): TextSpan => ({
  start: t.startOffset,
  end: t.startOffset + t.image.length,
});

const KINDS: readonly ReqKind[] = [
  "requirement",
  "functionalRequirement",
  "performanceRequirement",
  "interfaceRequirement",
  "physicalRequirement",
  "designConstraint",
  "element",
];
const REL_KINDS: readonly ReqRelKind[] = [
  "contains",
  "copies",
  "derives",
  "satisfies",
  "verifies",
  "refines",
  "traces",
];
const kindOf = (s: string): ReqKind | null => KINDS.find((k) => k === s) ?? null;
const relKindOf = (s: string): ReqRelKind | null => REL_KINDS.find((k) => k === s) ?? null;

// `key: value` — split on the first colon; the value keeps any later colons. Lines without a colon
// are skipped (null) rather than guessed at.
const fieldOf = (raw: string): ReqField | null => {
  const t = raw.trim();
  const colon = t.indexOf(":");
  if (colon < 0) return null;
  const key = t.slice(0, colon).trim();
  const value = t.slice(colon + 1).trim();
  if (key === "") return null;
  return { key, value };
};

const buildResult = (cst: CstNode): Result<ParsedRequirement, ParseError> => {
  const entities: ReqEntity[] = [];
  const entitySpans = new Map<ReqEntityId, TextSpan>();
  const relationships: ReqRel[] = [];
  const relSpans = new Map<ReqRelId, TextSpan>();

  for (const stmt of childNodes(cst.children, "reqStatement")) {
    const decl = childNodes(stmt.children, "reqEntityDecl")[0];
    if (decl !== undefined) {
      const kindTok = childTokens(decl.children, "ReqKindKw")[0];
      const nameTok = childTokens(decl.children, "ReqIdentifier")[0];
      if (kindTok === undefined || nameTok === undefined) continue;
      const kind = kindOf(kindTok.image);
      if (kind === null) continue;
      const block = childNodes(decl.children, "reqBody")[0];
      const fields =
        block === undefined
          ? []
          : childTokens(block.children, "ReqFieldText").reduce<ReqField[]>((acc, t) => {
              const f = fieldOf(t.image);
              if (f !== null) acc.push(f);
              return acc;
            }, []);
      const id = brand<string, "ReqEntityId">(nameTok.image);
      entities.push({ id, name: nameTok.image, kind, fields });
      if (!entitySpans.has(id)) entitySpans.set(id, tokenSpan(nameTok));
      continue;
    }

    const rel = childNodes(stmt.children, "reqRelationship")[0];
    if (rel === undefined) continue;
    const ids = childTokens(rel.children, "ReqIdentifier");
    const a = ids[0];
    const verb = ids[1];
    const b = ids[2];
    if (a === undefined || verb === undefined || b === undefined) continue;
    const verbKind = relKindOf(verb.image);
    if (verbKind === null) {
      return err(
        parseErrorAt(
          `requirement: unknown relationship verb "${verb.image}" (expected one of contains/copies/derives/satisfies/verifies/refines/traces)`,
          verb.startOffset,
          verb.image.length,
        ),
      );
    }
    // `a - verb -> b` is a→b; the reversed `a <- verb - b` is b→a (arrow points back at a).
    const reversed = childTokens(rel.children, "ReqRevArrow").length > 0;
    const fromTok = reversed ? b : a;
    const toTok = reversed ? a : b;
    const id = brand<string, "ReqRelId">(`r${relationships.length}`);
    relationships.push({
      id,
      from: brand<string, "ReqEntityId">(fromTok.image),
      to: brand<string, "ReqEntityId">(toTok.image),
      kind: verbKind,
    });
    // The verb is the editable span (the canvas shows it as the edge label). Re-typing it to another
    // of the seven verbs round-trips; an invalid verb fails the parse loudly, like any other token.
    relSpans.set(id, tokenSpan(verb));
  }

  return ok({
    ast: { kind: "requirement", entities, relationships },
    source: { entities: entitySpans, relationships: relSpans },
  });
};

export const parseRequirementWithSource = (text: string): Result<ParsedRequirement, ParseError> => {
  const lexed = reqLexer.tokenize(text);
  if (lexed.errors.length > 0) return err(lexingError(lexed.errors));
  reqParser.input = lexed.tokens;
  const cst = reqParser.requirementDiagram();
  if (reqParser.errors.length > 0) return err(recognitionError(reqParser.errors));
  return buildResult(cst);
};

export const parseRequirement = (text: string): Result<RequirementAst, ParseError> =>
  map(parseRequirementWithSource(text), (parsed) => parsed.ast);
