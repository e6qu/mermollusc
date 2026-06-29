import { assertNever, err, ok, type Result } from "@m/std";
import type {
  ActorId,
  C4ElementId,
  ClassEntityId,
  EdgeKind,
  ErEntityId,
  GitBranchName,
  GitCommitId,
  MindmapAst,
  MindmapNodeId,
  MindmapSource,
  MessageKind,
  ReqEntityId,
  NodeId,
  NodeShape,
  StateId,
  SourceMap,
  TextSpan,
  TimelineAst,
  TimelineEventId,
  TimelinePeriodId,
  TimelineSource,
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
  actor: ["(", ")"], // synthetic (gitGraph branch heads); never round-trips to flowchart text
};

const ARROW: Record<EdgeKind, string> = {
  arrow: "-->",
  open: "---",
  dotted: "-.->",
  thick: "==>",
};

const SEQ_ARROW: Record<MessageKind, string> = {
  solid: "->>",
  dashed: "-->>",
  solidOpen: "->",
  dashedOpen: "-->",
};

// The closing delimiter (or delimiters) that would terminate a label token early if it appeared in the
// label text, keyed by the label's syntactic context. `\n` is forbidden in every context (it ends the
// statement line). A `LabelContext` names where the label is being spliced:
//   - `flowchartBracket` — a flowchart node label inside `[ ]` / `( )` / `{ }` (any bracket closer breaks it);
//   - `pipe` — a `|…|` edge/element label (flowchart/network/cloud/block) terminated by `|`;
//   - `quoted` — a C4 `"…"` label terminated by `"`;
//   - `colon` — a timeline period/event or gantt task label, whose tokenizer splits the line on `:`
//     (`/[^:\n]+/`), so a `:` in the text would silently start a new event/meta field;
//   - `plain` — sequence/state/er/class/requirement/gitGraph/mindmap labels run to end of line (their
//     lexer pushes a rest-of-line mode after the leading `:`), so only `\n` is forbidden.
export type LabelContext = "flowchartBracket" | "pipe" | "quoted" | "colon" | "plain";

const FORBIDDEN: Record<LabelContext, readonly string[]> = {
  // Both bracket *openers* and *closers* are forbidden: a closer ends the shape early, and an opener
  // (`A(Mid)` relabelled to `[`) is also taken as a shape token and corrupts the line. This grammar
  // has no quoting for flowchart labels, so brackets simply can't appear in one.
  flowchartBracket: ["\n", "[", "]", "(", ")", "{", "}"],
  pipe: ["\n", "|"],
  quoted: ["\n", '"'],
  colon: ["\n", ":"],
  plain: ["\n"],
};

const renderChar = (ch: string): string => (ch === "\n" ? "\\n" : ch);

const forbiddenChar = (label: string, forbidden: readonly string[]): string | null => {
  for (const ch of forbidden) if (label.includes(ch)) return ch;
  return null;
};

// PURE/TOTAL: reject a label that contains a delimiter which would terminate its token early in the
// given syntactic context, so the spliced source stays parseable. The app shell calls this before
// committing an inline edge/element/node-label edit. Returns the unchanged label on success so callers
// can chain it; on a forbidden char returns a loud `PatchError`.
export const validateLabel = (label: string, context: LabelContext): Result<string, PatchError> => {
  // `%%` starts a comment to end-of-line in every family, so a label containing it would comment out the
  // rest of the statement — silently deleting the element. Forbidden in all contexts.
  if (label.includes("%%")) {
    return err({ kind: "patch", message: "label may not contain '%%' (it starts a comment)" });
  }
  const bad = forbiddenChar(label, FORBIDDEN[context]);
  return bad === null
    ? ok(label)
    : err({ kind: "patch", message: `label may not contain '${renderChar(bad)}'` });
};

const withTrailingNewline = (text: string): string => (text.endsWith("\n") ? text : `${text}\n`);

// The primitive behind every two-way edit: replace a source text span with new content.
export const patchSpan = (text: string, span: TextSpan, replacement: string): string =>
  text.slice(0, span.start) + replacement + text.slice(span.end);

// Add a `|label|` to a bare flowchart/block edge by splicing it right after the arrow token (its span).
// Rejects a delimiter that would break the pipe, so the result stays parseable. Use `patchSpan` on the
// existing `|label|` span to *rename* an edge that already has one — this is only the bare-edge case.
export const addEdgeLabel = (
  text: string,
  arrowSpan: TextSpan,
  label: string,
): Result<string, PatchError> => {
  if (label.trim().length === 0) return err({ kind: "patch", message: "label can't be empty" });
  const bad = forbiddenChar(label, FORBIDDEN.pipe);
  if (bad !== null) {
    return err({ kind: "patch", message: `label may not contain '${renderChar(bad)}'` });
  }
  return ok(`${text.slice(0, arrowSpan.end)}|${label}|${text.slice(arrowSpan.end)}`);
};

// Change a flowchart/block edge's presentational style by rewriting its arrow token (`-->`/`---`/`-.->`/
// `==>`) in place. Any `|label|` after it is untouched (the grammar accepts a label after every kind).
export const restyleEdge = (text: string, arrowSpan: TextSpan, kind: EdgeKind): string =>
  patchSpan(text, arrowSpan, ARROW[kind]);

export const restyleSequenceMessage = (
  text: string,
  arrowSpan: TextSpan,
  kind: MessageKind,
): string => patchSpan(text, arrowSpan, SEQ_ARROW[kind]);

// Gantt two-way editing: a bar drag rewrites its start date, a resize rewrites its duration, directly in
// the source (positions/sizes are semantic here, not layout overlay). Date math is pure (UTC, no clock).
const GANTT_DAY_MS = 86_400_000;
const ganttDayOf = (iso: string): number =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) /
  GANTT_DAY_MS;
const ganttISOofDay = (day: number): string => {
  const dt = new Date(day * GANTT_DAY_MS);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

// Slide an explicit `YYYY-MM-DD` start by whole calendar days (a no-op shift returns the text unchanged).
export const shiftGanttStart = (
  text: string,
  startSpan: TextSpan,
  oldISO: string,
  deltaDays: number,
): string =>
  deltaDays === 0
    ? text
    : patchSpan(text, startSpan, ganttISOofDay(ganttDayOf(oldISO) + deltaDays));

// Rewrite a task's duration field to `Nd` (at least 1 day, so a task never collapses to a milestone).
export const setGanttDuration = (text: string, durationSpan: TextSpan, days: number): string =>
  patchSpan(text, durationSpan, `${Math.max(1, Math.round(days))}d`);

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

const MINDMAP_INDENT_STEP = 2;
// Shift a line's leading indentation by `delta` spaces (never below zero); blank lines unchanged.
const reindentLine = (line: string, delta: number): string => {
  if (line.trim() === "") return line;
  const lead = line.length - line.trimStart().length;
  return " ".repeat(Math.max(0, lead + delta)) + line.slice(lead);
};

// Mindmap connect = re-parent: make `child` a child of `parent` by moving `child`'s whole subtree (its
// line + every deeper line under it) to directly after `parent`'s line and re-indenting it to one level
// below `parent`. Mindmap parentage is purely indentation, and lines carry no ids, so this needs the AST
// (levels/order) + source map (each node's line, via its label span). No-op (returns the text unchanged)
// when it would re-parent the root, form a cycle (parent inside the child's subtree), or change nothing.
export const connectMindmap = (
  text: string,
  source: MindmapSource,
  ast: MindmapAst,
  parentId: MindmapNodeId,
  childId: MindmapNodeId,
): string => {
  const nodes = ast.nodes;
  const pIdx = nodes.findIndex((n) => n.id === parentId);
  const cIdx = nodes.findIndex((n) => n.id === childId);
  const parent = nodes[pIdx];
  const child = nodes[cIdx];
  if (parent === undefined || child === undefined) return text;
  if (child.parent === null || child.id === parent.id || child.parent === parent.id) return text;
  // The child's subtree is the contiguous run of deeper nodes after it (pre-order).
  let cEnd = cIdx + 1;
  while (cEnd < nodes.length && (nodes[cEnd]?.level ?? -1) > child.level) cEnd++;
  if (pIdx >= cIdx && pIdx < cEnd) return text; // parent is inside the child's subtree → cycle

  const lineOf = (id: MindmapNodeId): number | null => {
    const span = source.nodes.get(id);
    return span === undefined ? null : text.slice(0, span.start).split("\n").length - 1;
  };
  const blockStart = lineOf(child.id);
  const lastSub = nodes[cEnd - 1];
  const blockEnd = lastSub === undefined ? null : lineOf(lastSub.id);
  const parentLine = lineOf(parent.id);
  if (blockStart === null || blockEnd === null || parentLine === null) return text;

  const lines = text.split("\n");
  const delta = (parent.level + 1 - child.level) * MINDMAP_INDENT_STEP;
  const block = lines.slice(blockStart, blockEnd + 1).map((ln) => reindentLine(ln, delta));
  const blockLen = blockEnd - blockStart + 1;
  lines.splice(blockStart, blockLen);
  // After removal, a parent below the block shifts up by the block's length.
  const insertAt = (parentLine > blockEnd ? parentLine - blockLen : parentLine) + 1;
  lines.splice(insertAt, 0, ...block);
  return lines.join("\n");
};

// A git branch name is bare when it's all word/`/`/`-` chars; otherwise it must be quoted to merge it.
const gitBranchToken = (name: string): string =>
  /^[A-Za-z0-9_/-]+$/.test(name) ? name : `"${name}"`;

// Connect two gitGraph branch lanes by merging `from` into `into` — `merge` is the only edge a git
// graph has. Appends `checkout <into>` then `merge <from>` (the checkout makes the merge land on the
// intended lane regardless of the current branch). A self-merge is a no-op.
export const connectGitMerge = (text: string, into: GitBranchName, from: GitBranchName): string => {
  if (into === from) return text;
  const trimmed = text.replace(/\s+$/, "");
  // Match the indentation of the last indented statement so the appended commands line up.
  const indented = [...trimmed.split("\n")].reverse().find((l) => /^\s+\S/.test(l));
  const indent = indented === undefined ? "  " : (/^\s*/.exec(indented)?.[0] ?? "  ");
  return `${trimmed}\n${indent}checkout ${gitBranchToken(into)}\n${indent}merge ${gitBranchToken(from)}\n`;
};

// Re-parent a timeline event under a different period (the timeline analogue of a mindmap re-parent):
// splice the ` : <event>` segment out of its current line and append it to the destination period's
// line. A no-op if the event already sits under that period or the source shape is unexpected.
export const moveTimelineEvent = (
  text: string,
  source: TimelineSource,
  ast: TimelineAst,
  eventId: TimelineEventId,
  periodId: TimelinePeriodId,
): string => {
  const eventSpan = source.events.get(eventId);
  const periodSpan = source.periods.get(periodId);
  const dest = ast.periods.find((p) => p.id === periodId);
  if (eventSpan === undefined || periodSpan === undefined || dest === undefined) return text;
  if (dest.events.some((e) => e.id === eventId)) return text; // already there
  // Remove ` : <event>`: walk back over whitespace to the separating colon (bail if it isn't there, so a
  // surprising layout fails closed rather than corrupting the line).
  let removeStart = eventSpan.start;
  while (removeStart > 0 && /[ \t]/.test(text[removeStart - 1] ?? "")) removeStart--;
  if (text[removeStart - 1] !== ":") return text;
  removeStart -= 1; // the separating colon
  // …and the whitespace before it, so `Alpha : Beta` → `Alpha`, not `Alpha ` with a dangling space.
  while (removeStart > 0 && /[ \t]/.test(text[removeStart - 1] ?? "")) removeStart--;
  const eventText = text.slice(eventSpan.start, eventSpan.end);
  // Append the event to the destination period's line (just before its terminating newline).
  const nl = text.indexOf("\n", periodSpan.end);
  const insertPos = nl === -1 ? text.length : nl;
  const edits = [
    { start: removeStart, end: eventSpan.end, replace: "" },
    { start: insertPos, end: insertPos, replace: ` : ${eventText}` },
  ].sort((a, b) => b.start - a.start); // apply right-to-left so earlier offsets stay valid
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.replace + out.slice(e.end);
  return out;
};

// The start offset of an event's ` : <event>` segment (the separating colon plus the whitespace around
// it), so removing [start, eventEnd) leaves the line clean. null if the colon isn't where expected.
const eventSegmentStart = (text: string, eventStart: number): number | null => {
  let s = eventStart;
  while (s > 0 && /[ \t]/.test(text[s - 1] ?? "")) s--;
  if (text[s - 1] !== ":") return null;
  s -= 1;
  while (s > 0 && /[ \t]/.test(text[s - 1] ?? "")) s--;
  return s;
};

// Delete a timeline event by splicing its ` : <event>` segment out of its line — leaving the period
// (and any sibling events) intact. A no-op if the event has no span.
export const deleteTimelineEvent = (
  text: string,
  source: TimelineSource,
  eventId: TimelineEventId,
): string => {
  const span = source.events.get(eventId);
  if (span === undefined) return text;
  const start = eventSegmentStart(text, span.start);
  return start === null ? text : text.slice(0, start) + text.slice(span.end);
};

// Delete a timeline period: remove its declaration line plus any following `:`-continuation lines (its
// events live on those), so the whole time point and its events go together.
export const deleteTimelinePeriod = (
  text: string,
  source: TimelineSource,
  periodId: TimelinePeriodId,
): string => {
  const span = source.periods.get(periodId);
  if (span === undefined) return text;
  const lines = text.split("\n");
  const start = text.slice(0, span.start).split("\n").length - 1;
  let end = start;
  while (end + 1 < lines.length && /^\s*:/.test(lines[end + 1] ?? "")) end++;
  lines.splice(start, end - start + 1);
  return lines.join("\n");
};

// Delete a mindmap node and its whole subtree (the contiguous run of deeper nodes after it in pre-order)
// — a mindmap node has no in-text id, so line-based `deleteNode` can't find it; the source-map label span
// locates its line and the AST levels bound the subtree.
export const deleteMindmapNode = (
  text: string,
  source: MindmapSource,
  ast: MindmapAst,
  id: MindmapNodeId,
): string => {
  const nodes = ast.nodes;
  const idx = nodes.findIndex((n) => n.id === id);
  const node = nodes[idx];
  if (node === undefined) return text;
  let end = idx + 1;
  while (end < nodes.length && (nodes[end]?.level ?? -1) > node.level) end++;
  const lineOf = (nid: MindmapNodeId): number | null => {
    const span = source.nodes.get(nid);
    return span === undefined ? null : text.slice(0, span.start).split("\n").length - 1;
  };
  const startLine = lineOf(node.id);
  const lastSub = nodes[end - 1];
  const endLine = lastSub === undefined ? null : lineOf(lastSub.id);
  if (startLine === null || endLine === null) return text;
  const lines = text.split("\n");
  lines.splice(startLine, endLine - startLine + 1);
  return lines.join("\n");
};

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
// The trailing `<<fork>>`/`<<join>>`/`<<choice>>` stereotype must be allowed, else a special state's
// declaration line isn't recognized and a canvas delete strips its transitions but leaves the node.
const STATE_DECL =
  /^\s*state\s+(?:"[^"]*"\s+as\s+)?([A-Za-z_]\w*)\s*(?:<<(?:fork|join|choice)>>)?\s*\{?\s*$/;
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
// A sequence `note (left of|right of|over) <actors>: text` line — the actors part is one id or `A,B`.
const SEQ_NOTE = /^\s*note\s+(?:left of|right of|over)\s+([^:]+?)\s*:/i;

export const deleteActor = (text: string, id: ActorId): string =>
  text
    .split("\n")
    .filter((line) => {
      const p = SEQ_PARTICIPANT.exec(line);
      if (p !== null && p[1] === id) return false;
      const msg = seqMessageIds(line);
      if (msg !== null && (msg[0] === id || msg[1] === id)) return false;
      // Drop notes anchored to the actor — leaving an orphaned `note … of Alice` is un-parseable.
      const note = SEQ_NOTE.exec(line);
      if (note !== null && note[1] !== undefined) {
        const actors = note[1].split(",").map((a) => a.trim());
        if (actors.includes(id)) return false;
      }
      return true;
    })
    .join("\n");

// Delete a flowchart `subgraph <id> … end` block whole (balancing nested subgraphs) — the line-based
// `deleteNode` strips only the `subgraph <id>` line and orphans the dangling `end`, breaking the parse.
const opensSubgraph = (trimmed: string): boolean => {
  if (!trimmed.startsWith("subgraph")) return false;
  const c = trimmed[8] ?? ""; // the char after the keyword must not continue an identifier (`subgraphX`)
  return !((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_");
};
export const deleteFlowSubgraph = (text: string, id: NodeId): string => {
  const lines = text.split("\n");
  const IDENT = /^[A-Za-z0-9_]+/;
  const openIdx = lines.findIndex((line) => {
    const t = line.trimStart();
    if (!opensSubgraph(t)) return false;
    const m = IDENT.exec(t.slice("subgraph".length).trimStart());
    return m !== null && m[0] === id;
  });
  if (openIdx === -1) return text;
  let depth = 0;
  let endIdx = -1;
  for (let i = openIdx; i < lines.length; i++) {
    const t = (lines[i] ?? "").trimStart();
    if (opensSubgraph(t)) depth++;
    if (/^end(?![A-Za-z0-9_])/.test(t)) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return text;
  lines.splice(openIdx, endIdx - openIdx + 1);
  return lines.join("\n");
};

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

// Delete a `block:id … end` composite and everything inside it (nested composites included), by
// matching the opening line to its balancing `end`. Line-based `deleteNode` can't: it would drop the
// `block:id` line but orphan the body + the dangling `end`.
export const deleteBlockGroup = (text: string, id: NodeId): string => {
  const lines = text.split("\n");
  // Match `block:<id>` by extracting the identifier after `block:` and comparing — avoids building a
  // regex from `id` (a non-literal pattern), and the lexer already restricts ids to `[A-Za-z0-9_]`.
  const IDENT = /^[A-Za-z0-9_]+/;
  const opensThisGroup = (line: string): boolean => {
    const t = line.trimStart();
    if (!t.startsWith("block:")) return false;
    const m = IDENT.exec(t.slice("block:".length));
    return m !== null && m[0] === id;
  };
  const openIdx = lines.findIndex(opensThisGroup);
  if (openIdx === -1) return text;
  let depth = 0;
  let endIdx = -1;
  for (let i = openIdx; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*block:/.test(line)) depth++;
    if (/^\s*end(?![A-Za-z0-9_])/.test(line)) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return text;
  lines.splice(openIdx, endIdx - openIdx + 1);
  return lines.join("\n");
};

// Delete a brace-delimited `group "label" { … }` container (network subnet/zone, cloud group) by the
// label's span: from the group's opening line, balance `{`/`}` (nested groups included) to its closing
// `}` and drop the whole block. The group id is synthetic (not in the text), so the label span is the
// reliable anchor; line-based `deleteNode` can't find it and would orphan the body + dangling `}`.
export const deleteGroupBlock = (text: string, labelSpan: TextSpan): string => {
  const lines = text.split("\n");
  const startLine = text.slice(0, labelSpan.start).split("\n").length - 1;
  let depth = 0;
  let started = false;
  let endLine = -1;
  let inQuote = false;
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i] ?? "") {
      // Braces inside a `"…"` label aren't structural — track quote state so `group "a{b" { … }` counts
      // only the real braces.
      if (ch === '"') inQuote = !inQuote;
      else if (!inQuote && ch === "{") {
        depth++;
        started = true;
      } else if (!inQuote && ch === "}") {
        depth--;
      }
    }
    if (started && depth <= 0) {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) return text; // unbalanced (the parser would have rejected it); leave it untouched
  lines.splice(startLine, endLine - startLine + 1);
  return lines.join("\n");
};

// Rename a block composite by rewriting every standalone-identifier occurrence of `oldId` to `newId`
// (the `block:id` opener *and* any edge endpoint that references the composite) — a plain label-span
// patch would rename only the opener and orphan the edges. A boundary-aware char scan (not a regex
// built from `oldId`) keeps it ReDoS-free; the parser guarantees ids are `[A-Za-z0-9_]+` and unique.
const isIdentChar = (c: string): boolean =>
  c.length === 1 &&
  ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_");
export const renameBlockId = (text: string, oldId: string, newId: string): string => {
  if (oldId.length === 0) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (
      text.startsWith(oldId, i) &&
      !isIdentChar(text[i - 1] ?? "") &&
      !isIdentChar(text[i + oldId.length] ?? "")
    ) {
      out += newId;
      i += oldId.length;
    } else {
      out += text[i] ?? "";
      i++;
    }
  }
  return out;
};

// Wrap the given source lines (by 0-based index) into a new `group "label" { … }` at the position of
// the first — gathering selected cloud leaves into a group. Lines are captured, removed bottom-up (so
// earlier indices stay valid), re-indented, and the group block inserted where the first one was. A
// no-op below two lines (a group of one is pointless).
export const wrapCloudGroup = (
  text: string,
  lineIndices: readonly number[],
  label: string,
): string => {
  const lines = text.split("\n");
  const idxs = [...new Set(lineIndices)]
    .filter((i) => i >= 0 && i < lines.length)
    .sort((a, b) => a - b);
  if (idxs.length < 2) return text;
  const captured = idxs.map((i) => (lines[i] ?? "").trim());
  for (let k = idxs.length - 1; k >= 0; k--) lines.splice(idxs[k] ?? 0, 1);
  const block = [`  group "${label}" {`, ...captured.map((l) => `    ${l}`), "  }"];
  lines.splice(idxs[0] ?? 0, 0, ...block);
  return lines.join("\n");
};

// Removes the whole source line (with its line break) containing `span`. Used to delete a Gantt task or
// a pie slice by its label span — families whose item may have no in-text id (a Gantt task's id can be
// auto-generated `t0…` and absent from the text; a pie slice's id is synthetic), so the span is the
// reliable key that id-matching like `deleteNode` can't find. When several are deleted at once the caller
// applies these bottom-up, so each span stays valid against the prior edit (removing a lower line never
// shifts an earlier one's offset).
export const deleteLineAt = (text: string, span: TextSpan): string => {
  const lineStart = text.lastIndexOf("\n", span.start - 1) + 1; // 0 when the span is on the first line
  const nl = text.indexOf("\n", span.start);
  const lineEnd = nl === -1 ? text.length : nl + 1; // include the trailing newline, if any
  return text.slice(0, lineStart) + text.slice(lineEnd);
};

const identTokens = (line: string): string[] =>
  line
    .replace(LABELS, "")
    // Drop a trailing `: label` (network/cloud edges read `a -- b : "eth0"`) so the endpoint match
    // isn't defeated by the label's words — otherwise a labelled edge is silently undeletable.
    .replace(/:.*$/, "")
    .split(NON_IDENT)
    .filter((t) => t.length > 0);

// Removes a standalone edge line (`from <arrow> to`, with labels stripped). Line-based like
// `deleteNode`: it matches a line whose only identifiers are exactly `[from, to]`, so node
// declarations and multi-hop chains are left intact (span-accurate removal would need edge spans).
export const deleteEdge = (text: string, from: NodeId, to: NodeId): string => {
  // Remove only the *first* matching edge line — parallel edges (`A --> B` twice) are distinct, so the
  // relationship-family deletes all use first-match too; a `.filter` would collaterally drop the twin.
  const lines = text.split("\n");
  const idx = lines.findIndex((line) => {
    const toks = identTokens(line);
    return toks.length === 2 && toks[0] === from && toks[1] === to;
  });
  if (idx === -1) return text;
  lines.splice(idx, 1);
  return lines.join("\n");
};

const escapeDotLabel = (s: string): string => s.replace(/(["\\])/g, "\\$1");

const dotShape = (shape: NodeShape): string => {
  switch (shape) {
    case "rect":
      return "box";
    case "round":
      return "oval";
    case "circle":
      return "circle";
    case "diamond":
      return "diamond";
    default:
      return "box";
  }
};

// Two-way edit: rewrite a node's label in the source text, touching only its span so the rest of
// the file (formatting, comments, ordering) is preserved. A bare node gets wrapped in brackets.
export const relabelNode = (
  text: string,
  source: SourceMap,
  id: NodeId,
  label: string,
  isDot = false,
): Result<string, PatchError> => {
  const spans = source.nodes.get(id);
  if (spans === undefined) return err({ kind: "patch", message: `unknown node: ${id}` });
  // An empty label would write `A[]`, which the grammar rejects — clearing a label must fail loudly, not
  // silently break the diagram (delete the node to remove it instead).
  if (label.trim().length === 0) return err({ kind: "patch", message: "label can't be empty" });

  if (isDot) {
    const escaped = escapeDotLabel(label);
    let replacement = escaped;
    if (spans.bracketed) {
      const isQuoted = text[spans.label.start - 1] === '"' && text[spans.label.end] === '"';
      if (!isQuoted && /[^\w.]/.test(label)) {
        replacement = `"${escaped}"`;
      }
    } else {
      replacement = `${id} [label="${escaped}"]`;
    }
    return ok(patchSpan(text, spans.label, replacement));
  }

  // The existing wrapper could be any flowchart shape (the span doesn't record which), so reject every
  // bracket closer — any one would terminate some shape's bracket early and corrupt the source.
  const bad = forbiddenChar(label, FORBIDDEN.flowchartBracket);
  if (bad !== null)
    return err({ kind: "patch", message: `label may not contain '${renderChar(bad)}'` });
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
    case "actor":
      return `(${label})`;
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
  isDot = false,
): Result<string, PatchError> => {
  const spans = source.nodes.get(id);
  if (spans === undefined) return err({ kind: "patch", message: `unknown node: ${id}` });
  if (label.trim().length === 0) return err({ kind: "patch", message: "label can't be empty" });

  if (isDot) {
    const replacement = `${id} [label="${escapeDotLabel(label)}" shape=${dotShape(shape)}]`;
    return ok(patchSpan(text, spans.decl, replacement));
  }

  // The label is re-wrapped in the target shape's brackets, so reject any bracket (opener or closer) or
  // newline — any of them would terminate the wrapper early and write un-parseable source.
  const bad = forbiddenChar(label, FORBIDDEN.flowchartBracket);
  if (bad !== null)
    return err({ kind: "patch", message: `label may not contain '${renderChar(bad)}'` });
  return ok(patchSpan(text, spans.decl, `${id}${wrapShape(shape, label)}`));
};

export const deleteGitCommit = (
  text: string,
  commitStatements: ReadonlyMap<GitCommitId, TextSpan> | null,
  id: GitCommitId,
): string => {
  if (commitStatements === null) return text;
  const span = commitStatements.get(id);
  return span === undefined ? text : deleteLineAt(text, span);
};

export const deleteGitBranch = (
  text: string,
  branchStatements: ReadonlyMap<GitBranchName, readonly TextSpan[]> | null,
  name: GitBranchName,
  branchCommits: readonly GitCommitId[],
  commitStatements: ReadonlyMap<GitCommitId, TextSpan> | null,
): string => {
  const spans: TextSpan[] = [];
  if (branchStatements !== null) {
    const list = branchStatements.get(name);
    if (list !== undefined) spans.push(...list);
  }
  if (commitStatements !== null) {
    for (const c of branchCommits) {
      const span = commitStatements.get(c);
      if (span !== undefined) spans.push(span);
    }
  }
  if (spans.length === 0) return text;

  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let result = text;
  for (const span of sorted) {
    result = deleteLineAt(result, span);
  }
  return result;
};
