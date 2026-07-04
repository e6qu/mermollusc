import { map, type Result } from "@m/std";
import type {
  BlockAst,
  BlockSource,
  C4Ast,
  C4Source,
  ClassAst,
  ClassSource,
  CloudAst,
  CloudSource,
  DiagramAst,
  ErAst,
  ErSource,
  FlowchartAst,
  GanttAst,
  GanttSource,
  GitGraphAst,
  GitGraphSource,
  MindmapAst,
  MindmapSource,
  NetworkAst,
  NetworkSource,
  PieAst,
  PieSource,
  RequirementAst,
  ReqSource,
  SequenceAst,
  SequenceSource,
  SourceMap,
  StateAst,
  StateSource,
  TimelineAst,
  TimelineSource,
} from "@m/contracts";
import { parseBlock, parseBlockWithSource } from "./block-parse.js";
import { parseC4, parseC4WithSource } from "./c4-parse.js";
import { parseClass, parseClassWithSource } from "./class-parse.js";
import { parseCloud, parseCloudWithSource } from "./cloud-parse.js";
import { parseEr, parseErWithSource } from "./er-parse.js";
import { parseGantt, parseGanttWithSource } from "./gantt-parse.js";
import { parseGitGraph, parseGitGraphWithSource } from "./git-parse.js";
import { parseDot, parseDotWithSource } from "./dot-parse.js";
import { parseMindmap, parseMindmapWithSource } from "./mindmap-parse.js";
import { parseNetwork, parseNetworkWithSource } from "./net-parse.js";
import { parsePie, parsePieWithSource } from "./pie-parse.js";
import { parse, parseWithSource } from "./parse.js";
import { parseRequirement, parseRequirementWithSource } from "./req-parse.js";
import type { ParseError } from "./parse.js";
import { parseSequence, parseSequenceWithSource } from "./seq-parse.js";
import { parseState, parseStateWithSource } from "./state-parse.js";
import { parseTimeline, parseTimelineWithSource } from "./timeline-parse.js";

// Forward-scans the `\n`-separated lines and returns the first trimmed line that is non-empty and not
// a `%%` comment, without materialising/trimming the whole document. Empty string if none qualifies.
// `trim()` strips the same whitespace (incl. a trailing `\r`) the old `split/map/find` relied on.
export const firstMeaningfulLine = (text: string): string => {
  let from = 0;
  while (from <= text.length) {
    const nl = text.indexOf("\n", from);
    const end = nl === -1 ? text.length : nl;
    const line = text.slice(from, end).trim();
    if (line.length > 0 && !line.startsWith("%%")) return line;
    if (nl === -1) break;
    from = nl + 1;
  }
  return "";
};

// The diagram-header keywords `parseDiagram` dispatches on (plus flowchart's `flowchart`/`graph`). Used
// to tell whether a chunk of text is a WHOLE diagram — e.g. so pasting one into the editor replaces the
// current diagram (and re-detects the family) instead of appending into it.
const DIAGRAM_HEADERS: readonly string[] = [
  "stateDiagram",
  "classDiagram",
  "requirementDiagram",
  "erDiagram",
  "sequenceDiagram",
  "C4",
  "block",
  "network",
  "cloud",
  "gitGraph",
  "timeline",
  "mindmap",
  "pie",
  "gantt",
  "flowchart",
  "graph",
  "digraph",
  "strict",
];

// True when the text's first meaningful line is a diagram header (i.e. it's a self-contained diagram).
export const looksLikeDiagramHeader = (text: string): boolean => {
  const header = firstMeaningfulLine(text);
  return DIAGRAM_HEADERS.some((h) => header.startsWith(h));
};

// Sniffs the first meaningful line (skipping blanks and `%%` comments) to pick the family.
export const parseDiagram = (text: string): Result<DiagramAst, ParseError> => {
  const header = firstMeaningfulLine(text);
  if (header.startsWith("stateDiagram")) return parseState(text);
  if (header.startsWith("classDiagram")) return parseClass(text);
  if (header.startsWith("requirementDiagram")) return parseRequirement(text);
  if (header.startsWith("erDiagram")) return parseEr(text);
  if (header.startsWith("sequenceDiagram")) return parseSequence(text);
  if (header.startsWith("C4")) return parseC4(text);
  if (header.startsWith("block")) return parseBlock(text);
  if (header.startsWith("network")) return parseNetwork(text);
  if (header.startsWith("cloud")) return parseCloud(text);
  if (header.startsWith("gitGraph")) return parseGitGraph(text);
  if (header.startsWith("timeline")) return parseTimeline(text);
  if (header.startsWith("mindmap")) return parseMindmap(text);
  if (header.startsWith("pie")) return parsePie(text);
  if (header.startsWith("gantt")) return parseGantt(text);
  // Graphviz DOT. `digraph`/`strict` are DOT-only; bare `graph` also starts a Mermaid flowchart
  // (`graph TD`), so only treat `graph` as DOT when its header line carries the opening brace — a
  // Mermaid `graph TD` never does (its `{` only appears later, in a decision-node label).
  if (
    header.startsWith("digraph") ||
    header.startsWith("strict") ||
    (header.startsWith("graph") && header.includes("{"))
  ) {
    return parseDot(text);
  }
  return parse(text);
};

// One parsed family with its editable source spans, tagged by `family`. The tag is a *dedicated*
// discriminator, not `ast.kind`: both the Mermaid flowchart parser and the Graphviz DOT importer yield
// an `ast.kind === "flowchart"`, so only `family` ("flowchart" vs "dot") tells them apart. For every
// other family `family` equals `ast.kind`. DOT has no source-span parser, so it carries an empty
// `SourceMap` (no editable spans) — the same shape a flowchart's source uses, so a consumer can treat
// the two flowchart-shaped families uniformly when it doesn't need to distinguish them.
export type ParsedWithSource =
  | { readonly family: "flowchart"; readonly ast: FlowchartAst; readonly source: SourceMap }
  | { readonly family: "dot"; readonly ast: FlowchartAst; readonly source: SourceMap }
  | { readonly family: "sequence"; readonly ast: SequenceAst; readonly source: SequenceSource }
  | { readonly family: "c4"; readonly ast: C4Ast; readonly source: C4Source }
  | { readonly family: "block"; readonly ast: BlockAst; readonly source: BlockSource }
  | { readonly family: "network"; readonly ast: NetworkAst; readonly source: NetworkSource }
  | { readonly family: "cloud"; readonly ast: CloudAst; readonly source: CloudSource }
  | { readonly family: "state"; readonly ast: StateAst; readonly source: StateSource }
  | { readonly family: "er"; readonly ast: ErAst; readonly source: ErSource }
  | { readonly family: "class"; readonly ast: ClassAst; readonly source: ClassSource }
  | { readonly family: "requirement"; readonly ast: RequirementAst; readonly source: ReqSource }
  | { readonly family: "gitGraph"; readonly ast: GitGraphAst; readonly source: GitGraphSource }
  | { readonly family: "timeline"; readonly ast: TimelineAst; readonly source: TimelineSource }
  | { readonly family: "mindmap"; readonly ast: MindmapAst; readonly source: MindmapSource }
  | { readonly family: "pie"; readonly ast: PieAst; readonly source: PieSource }
  | { readonly family: "gantt"; readonly ast: GanttAst; readonly source: GanttSource };

// Same header sniff as `parseDiagram`, but routes to each family's source-capturing parser so a single
// pass yields both the AST and the editable spans — the app no longer parses each family twice (once to
// detect the family, once for the source map). `parseDiagram`/`parseWithSource` stay as the ast-only /
// flowchart-only entry points.
export const parseDiagramWithSource = (text: string): Result<ParsedWithSource, ParseError> => {
  const header = firstMeaningfulLine(text);
  if (header.startsWith("stateDiagram"))
    return map(parseStateWithSource(text), (p) => ({ family: "state", ...p }));
  if (header.startsWith("classDiagram"))
    return map(parseClassWithSource(text), (p) => ({ family: "class", ...p }));
  if (header.startsWith("requirementDiagram"))
    return map(parseRequirementWithSource(text), (p) => ({ family: "requirement", ...p }));
  if (header.startsWith("erDiagram"))
    return map(parseErWithSource(text), (p) => ({ family: "er", ...p }));
  if (header.startsWith("sequenceDiagram"))
    return map(parseSequenceWithSource(text), (p) => ({ family: "sequence", ...p }));
  if (header.startsWith("C4")) return map(parseC4WithSource(text), (p) => ({ family: "c4", ...p }));
  if (header.startsWith("block"))
    return map(parseBlockWithSource(text), (p) => ({ family: "block", ...p }));
  if (header.startsWith("network"))
    return map(parseNetworkWithSource(text), (p) => ({ family: "network", ...p }));
  if (header.startsWith("cloud"))
    return map(parseCloudWithSource(text), (p) => ({ family: "cloud", ...p }));
  if (header.startsWith("gitGraph"))
    return map(parseGitGraphWithSource(text), (p) => ({ family: "gitGraph", ...p }));
  if (header.startsWith("timeline"))
    return map(parseTimelineWithSource(text), (p) => ({ family: "timeline", ...p }));
  if (header.startsWith("mindmap"))
    return map(parseMindmapWithSource(text), (p) => ({ family: "mindmap", ...p }));
  if (header.startsWith("pie"))
    return map(parsePieWithSource(text), (p) => ({ family: "pie", ...p }));
  if (header.startsWith("gantt"))
    return map(parseGanttWithSource(text), (p) => ({ family: "gantt", ...p }));
  // DOT has no source-span parser; pair its flowchart AST with an empty source map.
  if (
    header.startsWith("digraph") ||
    header.startsWith("strict") ||
    (header.startsWith("graph") && header.includes("{"))
  ) {
    return map(parseDotWithSource(text), (parsed) => ({ family: "dot", ...parsed }));
  }
  return map(parseWithSource(text), (p) => ({ family: "flowchart", ...p }));
};
