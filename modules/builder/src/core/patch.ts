import { assertNever, err, ok, type Result } from "@m/std";
import type {
  ActorId,
  C4ElementId,
  ClassEntityId,
  EdgeKind,
  ErEntityId,
  ReqEntityId,
  NodeId,
  NodeShape,
  StateId,
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

// A requirement relationship (`from - satisfies -> to`) — a default verb the user can re-type into
// any of the seven (contains/copies/derives/verifies/refines/traces) in the text.
export const connectRequirement = (text: string, from: ReqEntityId, to: ReqEntityId): string =>
  `${withTrailingNewline(text)}  ${from} - satisfies -> ${to}\n`;

// The forward `a - verb -> b` form that `connectRequirement` writes (a→b).
const REQ_REL = /^\s*(\S+)\s*-\s*\w+\s*->\s*(\S+)/;

// Remove the first requirement relationship line between two entities (by their ids).
export const deleteRequirementRel = (text: string, from: ReqEntityId, to: ReqEntityId): string => {
  const lines = text.split("\n");
  const idx = lines.findIndex((line) => {
    const m = REQ_REL.exec(line);
    return m !== null && m[1] === from && m[2] === to;
  });
  if (idx === -1) return text;
  lines.splice(idx, 1);
  return lines.join("\n");
};

const occurrences = (s: string, ch: string): number => s.split(ch).length - 1;

// Delete a compartment-family entity (ER / class / requirement) by id, properly: remove its
// declaration line and, if that line opens a `{ … }` body, the whole brace block (tracked by depth);
// and remove every relationship line incident to it. Line-based `deleteNode` can't do this — it
// strips only lines containing the id and orphans the body rows + closing `}`. `declId(line)` returns
// the entity declared on a line (or null); `relEnds(line)` returns a relationship's two endpoint ids.
const deleteEntityWithBody = (
  text: string,
  id: string,
  declId: (line: string) => string | null,
  relEnds: (line: string) => readonly [string, string] | null,
): string => {
  const out: string[] = [];
  let depth = 0;
  let inBlock = false;
  for (const line of text.split("\n")) {
    if (inBlock) {
      depth += occurrences(line, "{") - occurrences(line, "}");
      if (depth <= 0) inBlock = false;
      continue;
    }
    if (declId(line) === id) {
      const opens = occurrences(line, "{") - occurrences(line, "}");
      if (opens > 0) {
        depth = opens;
        inBlock = true;
      }
      continue;
    }
    const ends = relEnds(line);
    if (ends !== null && (ends[0] === id || ends[1] === id)) continue;
    out.push(line);
  }
  return out.join("\n");
};

const erEnds = (line: string): readonly [string, string] | null => {
  const m = ER_REL.exec(line);
  return m === null ? null : [m[1] ?? "", m[2] ?? ""];
};
// An ER entity declaration: a bare or block-opening name (quoted or hyphenated), nothing after it but
// an optional `{` — so relationship lines (which carry the crow's-foot operator) never match.
const ER_DECL = /^\s*(?:"([^"]*)"|([A-Za-z_][\w-]*))\s*\{?\s*$/;
const erDeclId = (line: string): string | null => {
  const m = ER_DECL.exec(line);
  return m === null ? null : (m[1] ?? m[2] ?? null);
};
export const deleteErEntity = (text: string, id: ErEntityId): string =>
  deleteEntityWithBody(text, id, erDeclId, erEnds);

const classEnds = (line: string): readonly [string, string] | null => {
  const m = CLASS_REL.exec(line);
  return m === null ? null : [m[1] ?? "", m[2] ?? ""];
};
// A class declaration (`class Foo` / `class Foo {`) or the `Foo : +member` shorthand — both belong to
// `Foo`. A relationship like `A <|-- B : x` never matches (it has the operator before the `:`).
const CLASS_DECL = /^\s*class\s+([A-Za-z_]\w*)\s*\{?\s*$/;
const CLASS_MEMBER = /^\s*([A-Za-z_]\w*)\s*:\s*\S/;
const classDeclId = (line: string): string | null =>
  CLASS_DECL.exec(line)?.[1] ?? CLASS_MEMBER.exec(line)?.[1] ?? null;
export const deleteClassEntity = (text: string, id: ClassEntityId): string =>
  deleteEntityWithBody(text, id, classDeclId, classEnds);

const reqEnds = (line: string): readonly [string, string] | null => {
  const m = REQ_REL.exec(line);
  return m === null ? null : [m[1] ?? "", m[2] ?? ""];
};
const REQ_DECL =
  /^\s*(?:requirement|functionalRequirement|performanceRequirement|interfaceRequirement|physicalRequirement|designConstraint|element)\s+([A-Za-z_]\w*)\s*\{?\s*$/;
const reqDeclId = (line: string): string | null => REQ_DECL.exec(line)?.[1] ?? null;
export const deleteRequirementEntity = (text: string, id: ReqEntityId): string =>
  deleteEntityWithBody(text, id, reqDeclId, reqEnds);

// A state declaration (`state id`, `state "Label" as id`, either optionally opening a `{ … }`
// composite block) or the `id : description` form — all belong to `id`. A transition (`a --> b`) or a
// description line never matches: the declaration needs the `state` keyword, and the description needs
// the `:` immediately after the id (transitions have the arrow first).
const STATE_DECL = /^\s*state\s+(?:"[^"]*"\s+as\s+)?([A-Za-z_]\w*)\s*\{?\s*$/;
const STATE_DESC = /^\s*([A-Za-z_]\w*)\s*:\s*\S/;
const stateDeclId = (line: string): string | null =>
  STATE_DECL.exec(line)?.[1] ?? STATE_DESC.exec(line)?.[1] ?? null;
// A state transition's two endpoints (each an id or the `[*]` pseudo-state), or a note's target
// returned as both endpoints so deleting the annotated state also drops its `note … of id` line. The
// `[*]` pseudo-state never equals a real id, so transitions to/from it are only removed via the real end.
const STATE_REL = /^\s*(\[\*\]|[A-Za-z_]\w*)\s*-->\s*(\[\*\]|[A-Za-z_]\w*)/;
const STATE_NOTE = /^\s*note\s+(?:right of|left of|over)\s+([A-Za-z_]\w*)/;
const stateEnds = (line: string): readonly [string, string] | null => {
  const rel = STATE_REL.exec(line);
  if (rel !== null) return [rel[1] ?? "", rel[2] ?? ""];
  const note = STATE_NOTE.exec(line);
  return note === null ? null : [note[1] ?? "", note[1] ?? ""];
};
// Remove a state and everything bound to it: a composite's whole `{ … }` block, its transitions, its
// description line, and any note annotating it. Line-based `deleteNode` would orphan a composite body.
export const deleteStateEntity = (text: string, id: StateId): string =>
  deleteEntityWithBody(text, id, stateDeclId, stateEnds);

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

// Removes the whole source line (with its line break) containing `span`. Used to delete a Gantt task
// by its label span: a task's id may be auto-generated (`t0`…) and absent from the text, so the span
// is the reliable key — id-matching like `deleteNode` can't find an auto-id task. When several tasks
// are deleted at once the caller applies these bottom-up, so each span stays valid against the prior
// edit (removing a lower line never shifts an earlier one's offset).
export const deleteGanttTask = (text: string, span: TextSpan): string => {
  const lineStart = text.lastIndexOf("\n", span.start - 1) + 1; // 0 when the span is on the first line
  const nl = text.indexOf("\n", span.start);
  const lineEnd = nl === -1 ? text.length : nl + 1; // include the trailing newline, if any
  return text.slice(0, lineStart) + text.slice(lineEnd);
};

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

// The bracket syntax for each flowchart node shape (`container` is the C4 boundary; reuse the rect
// brackets, since it isn't a flowchart node shape the editor cycles to).
const wrapShape = (shape: NodeShape, label: string): string => {
  switch (shape) {
    case "rect":
      return `[${label}]`;
    case "round":
      return `(${label})`;
    case "stadium":
      return `([${label}])`;
    case "circle":
      return `((${label}))`;
    case "diamond":
      return `{${label}}`;
    case "container":
      return `[${label}]`;
    default:
      return assertNever(shape);
  }
};

// Two-way edit: change a flowchart node's shape, rewriting its whole declaration span (`A[x]` →
// `A((x))` etc.) and keeping the label. A bare node (`A`) becomes `A<brackets>A` (its label is its id).
export const reshapeNode = (
  text: string,
  source: SourceMap,
  id: NodeId,
  label: string,
  shape: NodeShape,
): Result<string, PatchError> => {
  const spans = source.nodes.get(id);
  if (spans === undefined) return err({ kind: "patch", message: `unknown node: ${id}` });
  return ok(patchSpan(text, spans.decl, `${id}${wrapShape(shape, label)}`));
};
