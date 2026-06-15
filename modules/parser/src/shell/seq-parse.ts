import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, ok, type Result } from "@m/std";
import type { MessageKind, SequenceActor, SequenceAst, SequenceMessage } from "@m/contracts";
import type { ParseError } from "./parse.js";
import { sequenceParser } from "./seq-grammar.js";
import { seqLexer } from "./seq-tokens.js";

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;

const arrowKind = (c: Children): MessageKind => {
  if (childTokens(c, "SolidArrow").length > 0) return "solid";
  if (childTokens(c, "DashedArrow").length > 0) return "dashed";
  if (childTokens(c, "SolidOpen").length > 0) return "solidOpen";
  return "dashedOpen";
};

const buildAst = (cst: CstNode): Result<SequenceAst, ParseError> => {
  const root = cst.children;
  const actorLabels = new Map<string, string>();
  const seeActor = (id: string, label: string | null): void => {
    const current = actorLabels.get(id);
    if (current === undefined) actorLabels.set(id, label ?? id);
    else if (label !== null) actorLabels.set(id, label);
  };

  const messages: SequenceMessage[] = [];

  for (const stmt of childNodes(root, "seqStatement")) {
    const decl = childNodes(stmt.children, "participantDecl")[0];
    if (decl !== undefined) {
      const ids = childTokens(decl.children, "SeqIdentifier");
      seeActor(ids[0]?.image ?? "", ids[1]?.image ?? null);
      continue;
    }
    const msg = childNodes(stmt.children, "message")[0];
    if (msg === undefined) continue;
    const ids = childTokens(msg.children, "SeqIdentifier");
    const from = ids[0]?.image ?? "";
    const to = ids[1]?.image ?? "";
    seeActor(from, null);
    seeActor(to, null);
    const arrow = childNodes(msg.children, "arrow")[0];
    if (arrow === undefined)
      return err({ kind: "parse", errors: ["internal: message without arrow"] });
    messages.push({
      id: brand<string, "MessageId">(`m${messages.length}`),
      from: brand<string, "ActorId">(from),
      to: brand<string, "ActorId">(to),
      text: (imageOf(msg.children, "MsgText") ?? "").trim(),
      kind: arrowKind(arrow.children),
    });
  }

  const actors: SequenceActor[] = [...actorLabels].map(([id, label]) => ({
    id: brand<string, "ActorId">(id),
    label,
  }));
  return ok({ kind: "sequence", actors, messages });
};

export const parseSequence = (text: string): Result<SequenceAst, ParseError> => {
  const lexed = seqLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err({ kind: "parse", errors: lexed.errors.map((e) => e.message) });
  }
  sequenceParser.input = lexed.tokens;
  const cst = sequenceParser.sequence();
  if (sequenceParser.errors.length > 0) {
    return err({ kind: "parse", errors: sequenceParser.errors.map((e) => e.message) });
  }
  return buildAst(cst);
};
