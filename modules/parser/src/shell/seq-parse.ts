import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens, imageOf } from "./cst.js";
import type { Children } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  ActorId,
  MessageId,
  MessageKind,
  SequenceActor,
  SequenceAst,
  SequenceMessage,
  SequenceNote,
  SequenceNoteId,
  SequenceNoteSide,
  SequenceSource,
  TextSpan,
} from "@m/contracts";
import { lexingError, parseError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { sequenceParser } from "./seq-grammar.js";
import { seqLexer } from "./seq-tokens.js";

export interface ParsedSequence {
  readonly ast: SequenceAst;
  readonly source: SequenceSource;
}

// Span of a token's trimmed text — message text carries the leading space after `:`.
const trimmedSpan = (t: IToken): TextSpan => {
  const lead = t.image.length - t.image.trimStart().length;
  const start = t.startOffset + lead;
  return { start, end: start + t.image.trim().length };
};

const arrowKind = (c: Children): MessageKind => {
  if (childTokens(c, "SolidArrow").length > 0) return "solid";
  if (childTokens(c, "DashedArrow").length > 0) return "dashed";
  if (childTokens(c, "SolidOpen").length > 0) return "solidOpen";
  return "dashedOpen";
};

const buildResult = (cst: CstNode): Result<ParsedSequence, ParseError> => {
  const root = cst.children;
  const actorLabels = new Map<string, string>();
  const actorSpans = new Map<ActorId, TextSpan>();
  const messageSpans = new Map<MessageId, TextSpan>();
  const arrowSpans = new Map<MessageId, TextSpan>();
  const seeActor = (id: string, label: string | null): void => {
    const current = actorLabels.get(id);
    if (current === undefined) actorLabels.set(id, label ?? id);
    else if (label !== null) actorLabels.set(id, label);
  };

  const messages: SequenceMessage[] = [];
  const notes: SequenceNote[] = [];
  const noteSpans = new Map<SequenceNoteId, TextSpan>();

  for (const stmt of childNodes(root, "seqStatement")) {
    const noteNode = childNodes(stmt.children, "note")[0];
    if (noteNode !== undefined) {
      const targets = childTokens(noteNode.children, "SeqIdentifier");
      const side: SequenceNoteSide =
        childTokens(noteNode.children, "Over").length > 0
          ? "over"
          : childTokens(noteNode.children, "Left").length > 0
            ? "left"
            : "right";
      for (const t of targets) seeActor(t.image, null);
      const noteId = brand<string, "SequenceNoteId">(`note${notes.length}`);
      notes.push({
        id: noteId,
        side,
        targets: targets.map((t) => brand<string, "ActorId">(t.image)),
        text: (imageOf(noteNode.children, "MsgText") ?? "").trim(),
        after: messages.length,
      });
      const textToken = childTokens(noteNode.children, "MsgText")[0];
      if (textToken !== undefined) noteSpans.set(noteId, trimmedSpan(textToken));
      continue;
    }

    const decl = childNodes(stmt.children, "participantDecl")[0];
    if (decl !== undefined) {
      const ids = childTokens(decl.children, "SeqIdentifier");
      const idToken = ids[0];
      if (idToken !== undefined) {
        const labelToken = ids[1] ?? idToken;
        seeActor(idToken.image, ids[1]?.image ?? null);
        actorSpans.set(brand<string, "ActorId">(idToken.image), trimmedSpan(labelToken));
      }
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
    if (arrow === undefined) return err(parseError(["internal: message without arrow"]));

    const messageId = brand<string, "MessageId">(`m${messages.length}`);
    messages.push({
      id: messageId,
      from: brand<string, "ActorId">(from),
      to: brand<string, "ActorId">(to),
      text: (imageOf(msg.children, "MsgText") ?? "").trim(),
      kind: arrowKind(arrow.children),
    });
    const textToken = childTokens(msg.children, "MsgText")[0];
    if (textToken !== undefined) messageSpans.set(messageId, trimmedSpan(textToken));

    const arrowToken =
      childTokens(arrow.children, "SolidArrow")[0] ??
      childTokens(arrow.children, "DashedArrow")[0] ??
      childTokens(arrow.children, "SolidOpen")[0] ??
      childTokens(arrow.children, "DashedOpen")[0];
    if (arrowToken !== undefined) {
      arrowSpans.set(messageId, {
        start: arrowToken.startOffset,
        end: arrowToken.startOffset + arrowToken.image.length,
      });
    }
  }

  const actors: SequenceActor[] = [...actorLabels].map(([id, label]) => ({
    id: brand<string, "ActorId">(id),
    label,
  }));
  return ok({
    ast: { kind: "sequence", actors, messages, notes },
    source: { actors: actorSpans, messages: messageSpans, notes: noteSpans, arrows: arrowSpans },
  });
};

export const parseSequenceWithSource = (text: string): Result<ParsedSequence, ParseError> => {
  const lexed = seqLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  sequenceParser.input = lexed.tokens;
  const cst = sequenceParser.sequence();
  if (sequenceParser.errors.length > 0) {
    return err(recognitionError(sequenceParser.errors));
  }
  return buildResult(cst);
};

export const parseSequence = (text: string): Result<SequenceAst, ParseError> =>
  map(parseSequenceWithSource(text), (parsed) => parsed.ast);
