// Maps AST identities back to byte ranges in the source text, so the builder can patch the
// exact span a node/edge came from (two-way sync) without reformatting the rest of the file.

import type {
  ActorId,
  C4ElementId,
  C4RelId,
  ClassEntityId,
  ClassRelId,
  EdgeId,
  GitCommitId,
  GitBranchName,
  MindmapNodeId,
  PieSliceId,
  TimelineEventId,
  TimelinePeriodId,
  ReqEntityId,
  ReqRelId,
  ErEntityId,
  ErRelId,
  MessageId,
  SequenceNoteId,
  NodeId,
  GanttTaskId,
  StateId,
  StateTransitionId,
} from "./ast.js";

export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

export interface NodeSpans {
  readonly id: TextSpan;
  readonly label: TextSpan;
  // The whole node declaration (`A`, `A[label]`, `A([label])`, …) — the span a reshape rewrites.
  readonly decl: TextSpan;
  readonly bracketed: boolean;
}

export interface SourceMap {
  readonly nodes: ReadonlyMap<NodeId, NodeSpans>;
  // Inner `|label|` span for each edge that carries one (for two-way edge-label editing).
  readonly edges: ReadonlyMap<EdgeId, TextSpan>;
  // The arrow-token span (`-->`/`---`/`-.->`/`==>`) of every edge — for restyling the arrow and for
  // inserting a `|label|` on a bare edge (after the token).
  readonly arrows: ReadonlyMap<EdgeId, TextSpan>;
  // The directive-token span of each SINGLE-target inline `style <id> …` line, keyed by that node id —
  // so the editor can update or remove a node's colour directive in place. Multi-target `style A,B …`
  // lines and class-based colours aren't here (the editor appends an overriding single-node line).
  readonly styleSpans: ReadonlyMap<NodeId, TextSpan>;
  // The directive-token span of each SINGLE-index `linkStyle <n> …` line, keyed by that edge index — so
  // the editor can update/remove an edge's colour in place. Multi-index / `default` lines aren't here.
  readonly linkStyleSpans: ReadonlyMap<number, TextSpan>;
  // The whole-block span (`subgraph … end`) of each subgraph, keyed by its id — so the editor can remove
  // a subgraph (ungroup) by deleting its block.
  readonly subgraphSpans: ReadonlyMap<NodeId, TextSpan>;
  // Each edge's two endpoint DECLARATION spans (the `A` / `A[label]` at each end of `A --> B`), so the
  // editor can reconnect an end by rewriting that span to a different node id. Keyed by edge id.
  readonly edgeEnds: ReadonlyMap<EdgeId, EdgeEndSpans>;
}

// The source spans of an edge's two endpoints — the node reference at each end, for reconnection.
export interface EdgeEndSpans {
  readonly from: TextSpan;
  readonly to: TextSpan;
}

// Editable text spans for a sequence diagram: each actor's label, each message's text, and its arrow.
export interface SequenceSource {
  readonly actors: ReadonlyMap<ActorId, TextSpan>;
  readonly messages: ReadonlyMap<MessageId, TextSpan>;
  readonly notes: ReadonlyMap<SequenceNoteId, TextSpan>;
  readonly arrows: ReadonlyMap<MessageId, TextSpan>;
}

// Editable text spans for a C4 diagram: the inner (unquoted) label of each element and relation.
export interface C4Source {
  readonly elements: ReadonlyMap<C4ElementId, TextSpan>;
  readonly rels: ReadonlyMap<C4RelId, TextSpan>;
  // Span of each element's `UpdateElementStyle(…)` call, for in-place colour edits.
  readonly styleSpans: ReadonlyMap<C4ElementId, TextSpan>;
}

// Editable text spans for a block diagram: the label of each explicitly-labelled block and of
// each edge that carries a `|label|`. `bareNodes` carries the *id-token* span of each label-less
// block, so the editor can relabel one by wrapping its id into an `id["label"]` declaration.
export interface BlockSource {
  readonly blocks: ReadonlyMap<NodeId, TextSpan>;
  readonly edges: ReadonlyMap<EdgeId, TextSpan>;
  // The arrow-token span of every edge — for restyle + inserting a `|label|` on a bare edge.
  readonly arrows: ReadonlyMap<EdgeId, TextSpan>;
  readonly bareNodes: ReadonlyMap<NodeId, TextSpan>;
  // Label span of each `block:id … end` composite — its `["label"]` if present, else the id token.
  readonly groups: ReadonlyMap<NodeId, TextSpan>;
  // Spans of single-target `style <id>` lines, for in-place colour edits.
  readonly styleSpans: ReadonlyMap<NodeId, TextSpan>;
  // Spans of single-index `linkStyle <n>` lines, keyed by the edge/link declaration index.
  readonly linkStyleSpans: ReadonlyMap<number, TextSpan>;
}

// Editable text spans for a network diagram: the inner label of each node that has a quoted label
// and of each link that carries one. `bareNodes` carries the id-token span of each label-less node,
// so the editor can relabel one by appending a `"label"` after its id.
export interface NetworkSource {
  readonly nodes: ReadonlyMap<NodeId, TextSpan>;
  readonly links: ReadonlyMap<EdgeId, TextSpan>;
  readonly bareNodes: ReadonlyMap<NodeId, TextSpan>;
  // Inner-label span of each subnet/zone `group "…"`, for relabel.
  readonly groups: ReadonlyMap<NodeId, TextSpan>;
  // Spans of single-target `style <id>` lines, for in-place colour edits.
  readonly styleSpans: ReadonlyMap<NodeId, TextSpan>;
  // Spans of single-index `linkStyle <n>` lines, keyed by the edge/link declaration index.
  readonly linkStyleSpans: ReadonlyMap<number, TextSpan>;
}

// Editable text spans for a state diagram: each state's label (from `id : label` or
// `state "label" as id`) and each transition's `: label`. Bare states / unlabelled transitions have
// no entry; `[*]` pseudo-states never do.
export interface StateSource {
  readonly states: ReadonlyMap<StateId, TextSpan>;
  readonly transitions: ReadonlyMap<StateTransitionId, TextSpan>;
  // Span of each single-target `style <id> …` directive line, keyed by the state it colours — lets the
  // editor rewrite/remove that state's colour in place (as `SourceMap.styleSpans` does for flowchart).
  readonly styleSpans: ReadonlyMap<StateId, TextSpan>;
  // Span of each single-index `linkStyle <n> …` line, keyed by the transition's declaration index.
  readonly linkStyleSpans: ReadonlyMap<number, TextSpan>;
}

// Editable text spans for an ER diagram: each entity's name and each relationship's `: label`.
export interface ErSource {
  readonly entities: ReadonlyMap<ErEntityId, TextSpan>;
  readonly relationships: ReadonlyMap<ErRelId, TextSpan>;
  // Spans of single-target `style <id>` lines, for in-place colour edits (mirrors SourceMap.styleSpans).
  readonly styleSpans: ReadonlyMap<ErEntityId, TextSpan>;
  // Spans of single-index `linkStyle <n>` lines, keyed by the relationship's declaration index.
  readonly linkStyleSpans: ReadonlyMap<number, TextSpan>;
}

// Editable text spans for a class diagram: each class's name and each relationship's `: label`.
export interface ClassSource {
  readonly entities: ReadonlyMap<ClassEntityId, TextSpan>;
  readonly relationships: ReadonlyMap<ClassRelId, TextSpan>;
  // Spans of single-target `style <id>` lines, for in-place colour edits.
  readonly styleSpans: ReadonlyMap<ClassEntityId, TextSpan>;
  // Spans of single-index `linkStyle <n>` lines, keyed by the relationship's declaration index.
  readonly linkStyleSpans: ReadonlyMap<number, TextSpan>;
}

// Editable text spans for a requirement diagram: each entity's name. Relationship verbs are closed
// keywords (not free text), so they carry no editable span — the map is present but empty.
export interface ReqSource {
  readonly entities: ReadonlyMap<ReqEntityId, TextSpan>;
  readonly relationships: ReadonlyMap<ReqRelId, TextSpan>;
}

// Editable text spans for a git graph: the inner label of each commit's explicit `id: "…"`. Commits
// with an auto-generated id (no `id:`) have no entry; branch names and tags aren't editable inline.
export interface GitGraphSource {
  readonly commits: ReadonlyMap<GitCommitId, TextSpan>;
  readonly commitStatements: ReadonlyMap<GitCommitId, TextSpan> | null;
  readonly branchStatements: ReadonlyMap<GitBranchName, readonly TextSpan[]> | null;
}

// Editable text spans for a timeline: each period's text and each event's text. Section names aren't
// editable inline (the map covers periods + events only).
export interface TimelineSource {
  readonly periods: ReadonlyMap<TimelinePeriodId, TextSpan>;
  readonly events: ReadonlyMap<TimelineEventId, TextSpan>;
}

// Editable text spans for a mindmap: each node's label (the inner text of a shaped node, or the whole
// text of a plain one). Nodes with an empty label have no entry.
export interface MindmapSource {
  readonly nodes: ReadonlyMap<MindmapNodeId, TextSpan>;
}

// Editable text spans for a pie chart: each slice's label (the inner text of its `"…"`).
export interface PieSource {
  readonly slices: ReadonlyMap<PieSliceId, TextSpan>;
}

// Editable text spans for a Gantt chart: each task's label (the text before its `:`).
export interface GanttSource {
  readonly tasks: ReadonlyMap<GanttTaskId, TextSpan>;
  // The full start field span for every task (`YYYY-MM-DD` or `after ...`), the start-date span for
  // tasks with an explicit date, and the duration field span. A drag can slide an explicit date or
  // replace an `after` field with a concrete date; a resize rewrites the duration.
  readonly taskStartField: ReadonlyMap<GanttTaskId, TextSpan>;
  readonly taskStart: ReadonlyMap<GanttTaskId, TextSpan>;
  readonly taskDuration: ReadonlyMap<GanttTaskId, TextSpan>;
}

// Editable text spans for a cloud diagram: the inner label of each group, each labelled service
// leaf, and each labelled link. `bareNodes` carries the id-token span of each label-less leaf, so the
// editor can relabel one by appending a `"label"` after its id. Keyed by the element/link id.
export interface CloudSource {
  readonly groups: ReadonlyMap<NodeId, TextSpan>;
  readonly nodes: ReadonlyMap<NodeId, TextSpan>;
  readonly links: ReadonlyMap<EdgeId, TextSpan>;
  readonly bareNodes: ReadonlyMap<NodeId, TextSpan>;
  // Spans of single-target `style <id>` lines, for in-place colour edits.
  readonly styleSpans: ReadonlyMap<NodeId, TextSpan>;
  // Spans of single-index `linkStyle <n>` lines, keyed by the edge/link declaration index.
  readonly linkStyleSpans: ReadonlyMap<number, TextSpan>;
}
