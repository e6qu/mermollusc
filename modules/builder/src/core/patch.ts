import { err, ok, type Result } from "@m/std";
import type {
  ActorId,
  C4ElementId,
  ClassEntityId,
  EdgeKind,
  ErEntityId,
  NodeId,
  NodeShape,
  SourceMap,
  TextSpan,
} from "@m/contracts";

export interface PatchError {
  readonly kind: "patch";
  readonly message: string;
}

const NODE_WRAP: Record<NodeShape, readonly [string, string]> = {
  rect: ["[", "]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  diamond: ["{", "}"],
  circle: ["((", "))"],
  container: ["[", "]"],
};

const ARROW: Record<EdgeKind, string> = {
  arrow: "-->",
  open: "---",
  dotted: "-.->",
  thick: "==>",
};

const withTrailingNewline = (text: string): string => (text.endsWith("\n") ? text : `${text}\n`);

// The primitive behind every two-way edit: replace a source text span with new content.
export const patchSpan = (text: string, span: TextSpan, replacement: string): string =>
  text.slice(0, span.start) + replacement + text.slice(span.end);

// Structural edits append a line, leaving existing text (formatting/comments) intact.
export const addNode = (text: string, id: NodeId, label: string, shape: NodeShape): string => {
  const [open, close] = NODE_WRAP[shape];
  return `${withTrailingNewline(text)}  ${id}${open}${label}${close}\n`;
};

export const connect = (text: string, from: NodeId, to: NodeId, kind: EdgeKind): string =>
  `${withTrailingNewline(text)}  ${from} ${ARROW[kind]} ${to}\n`;

// Undirected link (`from -- to`) for the network and cloud families. `deleteEdge` removes it the
// same way (it keys on the two ident tokens, regardless of the operator between them).
export const connectUndirected = (text: string, from: NodeId, to: NodeId): string =>
  `${withTrailingNewline(text)}  ${from} -- ${to}\n`;

// A C4 relation (`Rel(from, to, "")`) — an empty label, which the grammar accepts and the user can
// then rename via the inline editor.
export const connectC4 = (text: string, from: C4ElementId, to: C4ElementId): string =>
  `${withTrailingNewline(text)}  Rel(${from}, ${to}, "")\n`;

// A sequence message (`from->>to: message`). The grammar requires message text, so a default label
// is inserted for the user to rename.
export const connectMessage = (text: string, from: ActorId, to: ActorId): string =>
  `${withTrailingNewline(text)}  ${from}->>${to}: message\n`;

// An ER relationship (`from ||--o{ to : relates`) — a default one-to-many with a placeholder label
// the user can rename via the inline editor.
export const connectEr = (text: string, from: ErEntityId, to: ErEntityId): string =>
  `${withTrailingNewline(text)}  ${from} ||--o{ ${to} : relates\n`;

// The crow's-foot operator between two ER entities on a relationship line.
const ER_REL = /^\s*(\S+)\s+(?:\|o|\|\||\}o|\}\|)(?:--|\.\.)(?:o\||\|\||o\{|\|\{)\s+(\S+)/;

// Remove the first ER relationship line between two entities (by their ids; duplicates can't be told
// apart by endpoints).
export const deleteErRel = (text: string, from: ErEntityId, to: ErEntityId): string => {
  const lines = text.split("\n");
  const idx = lines.findIndex((line) => {
    const m = ER_REL.exec(line);
    return m !== null && m[1] === from && m[2] === to;
  });
  if (idx === -1) return text;
  lines.splice(idx, 1);
  return lines.join("\n");
};

// A class relationship (`from --> to`) — a plain association the user can re-type into inheritance
// (`<|--`), composition (`*--`), etc., or label via the inline editor.
export const connectClass = (text: string, from: ClassEntityId, to: ClassEntityId): string =>
  `${withTrailingNewline(text)}  ${from} --> ${to}\n`;

// The UML operator between two class ids on a relationship line (heads optional, `--`/`..` line).
const CLASS_REL = /^\s*(\S+)\s+(?:<\||<|\*|o)?(?:--|\.\.)(?:\|>|>|\*|o)?\s+(\S+)/;

// Remove the first class relationship line between two classes (by their ids).
export const deleteClassRel = (text: string, from: ClassEntityId, to: ClassEntityId): string => {
  const lines = text.split("\n");
  const idx = lines.findIndex((line) => {
    const m = CLASS_REL.exec(line);
    return m !== null && m[1] === from && m[2] === to;
  });
  if (idx === -1) return text;
  lines.splice(idx, 1);
  return lines.join("\n");
};

const occurrences = (s: string, ch: string): number => s.split(ch).length - 1;

// The endpoint ids of a C4 `Rel(a, b, …)` line (bare identifiers inside the parens), or null.
const C4_REL = /^\s*Rel\s*\(([^)]*)\)/;
const c4RelIds = (line: string): readonly [string, string] | null => {
  const m = C4_REL.exec(line);
  if (m === null) return null;
  const [, body = ""] = m;
  const ids = body
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_]+$/.test(s));
  const first = ids[0] ?? null;
  const second = ids[1] ?? null;
  return first === null || second === null ? null : [first, second];
};

const C4_DECL = /^\s*(?:Person|System|Container|Boundary)\s*\(\s*([A-Za-z0-9_]+)/;
const c4DeclId = (line: string): string | null => {
  const m = C4_DECL.exec(line);
  if (m === null) return null;
  const [, declared = ""] = m;
  return declared;
};

// Remove a C4 element and the relations that reference it. A boundary owns a `{ … }` block, so its
// whole block (and the elements nested in it) is removed by brace-matching from its declaration line.
export const deleteC4 = (text: string, id: C4ElementId): string => {
  const lines = text.split("\n");
  const removedLines = new Set<number>();
  const removedIds = new Set<string>([id]);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (c4DeclId(line) !== id) continue;
    if (!line.includes("{")) {
      removedLines.add(i);
      continue;
    }
    let depth = 0;
    let j = i;
    do {
      const blockLine = lines[j] ?? "";
      removedLines.add(j);
      const nestedId = c4DeclId(blockLine);
      if (nestedId !== null) removedIds.add(nestedId);
      depth += occurrences(blockLine, "{") - occurrences(blockLine, "}");
      j++;
    } while (j < lines.length && depth > 0);
    break;
  }
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (removedLines.has(i)) continue;
    const rel = c4RelIds(line);
    if (rel !== null && (removedIds.has(rel[0]) || removedIds.has(rel[1]))) continue;
    out.push(line);
  }
  return out.join("\n");
};

export const deleteC4Rel = (text: string, from: C4ElementId, to: C4ElementId): string =>
  text
    .split("\n")
    .filter((line) => {
      const rel = c4RelIds(line);
      return !(rel !== null && rel[0] === from && rel[1] === to);
    })
    .join("\n");

const SEQ_PARTICIPANT = /^\s*participant\s+([A-Za-z0-9_]+)/;
// The (from, to) actor ids of a sequence message line (`from <arrow> to : text`), or null.
const SEQ_MESSAGE = /^\s*([A-Za-z0-9_]+)\s*(?:-->>|-->|->>|->)\s*([A-Za-z0-9_]+)\s*:/;
const seqMessageIds = (line: string): readonly [string, string] | null => {
  const m = SEQ_MESSAGE.exec(line);
  if (m === null) return null;
  const [, from = "", to = ""] = m;
  return from.length === 0 || to.length === 0 ? null : [from, to];
};

// Remove a sequence actor: its `participant` declaration (if any) and every message referencing it.
export const deleteActor = (text: string, id: ActorId): string =>
  text
    .split("\n")
    .filter((line) => {
      const p = SEQ_PARTICIPANT.exec(line);
      if (p !== null && p[1] === id) return false;
      const msg = seqMessageIds(line);
      return !(msg !== null && (msg[0] === id || msg[1] === id));
    })
    .join("\n");

// Remove the first message line between two actors (duplicates can't be told apart by endpoints).
export const deleteMessage = (text: string, from: ActorId, to: ActorId): string => {
  const lines = text.split("\n");
  const idx = lines.findIndex((line) => {
    const msg = seqMessageIds(line);
    return msg !== null && msg[0] === from && msg[1] === to;
  });
  if (idx === -1) return text;
  lines.splice(idx, 1);
  return lines.join("\n");
};

const LABELS = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\|[^|]*\|/g;
const NON_IDENT = /[^A-Za-z0-9_]+/;

// Removes a node's declaration line and any edge line that references it. Line-based and
// bracket-aware: labels are stripped, then the line is split into identifier tokens, so an id
// mentioned inside a label can't match. A span-accurate version would need per-line/edge spans.
export const deleteNode = (text: string, id: NodeId): string =>
  text
    .split("\n")
    .filter((line) => !line.replace(LABELS, "").split(NON_IDENT).includes(id))
    .join("\n");

const identTokens = (line: string): string[] =>
  line
    .replace(LABELS, "")
    .split(NON_IDENT)
    .filter((t) => t.length > 0);

// Removes a standalone edge line (`from <arrow> to`, with labels stripped). Line-based like
// `deleteNode`: it matches a line whose only identifiers are exactly `[from, to]`, so node
// declarations and multi-hop chains are left intact (span-accurate removal would need edge spans).
export const deleteEdge = (text: string, from: NodeId, to: NodeId): string =>
  text
    .split("\n")
    .filter((line) => {
      const toks = identTokens(line);
      return !(toks.length === 2 && toks[0] === from && toks[1] === to);
    })
    .join("\n");

// Two-way edit: rewrite a node's label in the source text, touching only its span so the rest of
// the file (formatting, comments, ordering) is preserved. A bare node gets wrapped in brackets.
export const relabelNode = (
  text: string,
  source: SourceMap,
  id: NodeId,
  label: string,
): Result<string, PatchError> => {
  const spans = source.nodes.get(id);
  if (spans === undefined) return err({ kind: "patch", message: `unknown node: ${id}` });
  const replacement = spans.bracketed ? label : `${id}[${label}]`;
  return ok(patchSpan(text, spans.label, replacement));
};
