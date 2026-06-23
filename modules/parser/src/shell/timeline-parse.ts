import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import type { Children } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  TimelineAst,
  TimelineEvent,
  TimelineEventId,
  TimelinePeriod,
  TimelinePeriodId,
  TimelineSource,
  TextSpan,
} from "@m/contracts";
import { lexingError, parseErrorAt, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { timelineParser } from "./timeline-grammar.js";
import { timelineLexer } from "./timeline-tokens.js";

export interface ParsedTimeline {
  readonly ast: TimelineAst;
  readonly source: TimelineSource;
}

// The span of a token's text with surrounding whitespace stripped, so a relabel patches just the
// visible text (not the leading space after a `:` or the indent before a period).
const trimmedSpan = (t: IToken): TextSpan => {
  const lead = t.image.length - t.image.trimStart().length;
  const trail = t.image.length - t.image.trimEnd().length;
  return { start: t.startOffset + lead, end: t.startOffset + t.image.length - trail };
};

// Mermaid uses `<br>` for a manual line break inside a period/event label; map it to a newline (the
// renderer stacks newline-separated lines, and the timeline layout grows the cell per line).
const softBreaks = (s: string): string => s.replace(/<br\s*\/?>/gi, "\n");

// The text of a `title`/`section` line: everything after the keyword to the line end, read straight
// from the source so any colons in the value survive (the lexer would otherwise split on them).
const lineValue = (text: string, keyword: IToken): string => {
  const start =
    keyword.endOffset === undefined
      ? keyword.startOffset + keyword.image.length
      : keyword.endOffset + 1;
  const nl = text.indexOf("\n", start);
  return text.slice(start, nl === -1 ? text.length : nl).trim();
};

interface PeriodBuilder {
  readonly id: TimelinePeriodId;
  readonly label: string;
  readonly section: string | null;
  readonly events: TimelineEvent[];
}

const buildResult = (cst: CstNode, text: string): Result<ParsedTimeline, ParseError> => {
  const root = cst.children;
  let title: string | null = null;
  let section: string | null = null;
  const periods: PeriodBuilder[] = [];
  const periodSpans = new Map<TimelinePeriodId, TextSpan>();
  const eventSpans = new Map<TimelineEventId, TextSpan>();
  let eventSeq = 0;

  // Builds events from the `BodyText` chunks of a period/continuation line, skipping empty ones
  // (`2002 :` with a dangling colon), and records each event's trimmed span.
  const eventsOf = (line: Children): TimelineEvent[] => {
    const out: TimelineEvent[] = [];
    for (const tok of childTokens(line, "BodyText")) {
      const trimmed = tok.image.trim();
      if (trimmed === "") continue;
      const id = brand<string, "TimelineEventId">(`e${eventSeq++}`);
      out.push({ id, text: softBreaks(trimmed) });
      eventSpans.set(id, trimmedSpan(tok));
    }
    return out;
  };

  for (const stmt of childNodes(root, "statement")) {
    const sc = stmt.children;

    const titleLine = childNodes(sc, "titleLine")[0];
    if (titleLine !== undefined) {
      const kw = childTokens(titleLine.children, "Title")[0];
      if (kw !== undefined) title = lineValue(text, kw);
      continue;
    }

    const sectionLine = childNodes(sc, "sectionLine")[0];
    if (sectionLine !== undefined) {
      const kw = childTokens(sectionLine.children, "Section")[0];
      const value = kw === undefined ? "" : lineValue(text, kw);
      section = value === "" ? null : value;
      continue;
    }

    const periodLine = childNodes(sc, "periodLine")[0];
    if (periodLine !== undefined) {
      const periodTok = childTokens(periodLine.children, "PeriodText")[0];
      if (periodTok === undefined) continue;
      const id = brand<string, "TimelinePeriodId">(`p${periods.length}`);
      periods.push({
        id,
        label: softBreaks(periodTok.image.trim()),
        section,
        events: eventsOf(periodLine.children),
      });
      periodSpans.set(id, trimmedSpan(periodTok));
      continue;
    }

    const continuationLine = childNodes(sc, "continuationLine")[0];
    if (continuationLine !== undefined) {
      const last = periods[periods.length - 1];
      if (last === undefined) {
        const colon = childTokens(continuationLine.children, "LeadColon")[0];
        const msg = "timeline: event continuation (`:`) before any period";
        return colon === undefined
          ? err(parseErrorAt(msg, 0, 1))
          : err(parseErrorAt(msg, colon.startOffset, 1));
      }
      last.events.push(...eventsOf(continuationLine.children));
    }
  }

  const finalized: TimelinePeriod[] = periods.map((p) => ({
    id: p.id,
    label: p.label,
    section: p.section,
    events: p.events,
  }));

  return ok({
    ast: { kind: "timeline", title, periods: finalized },
    source: { periods: periodSpans, events: eventSpans },
  });
};

export const parseTimelineWithSource = (text: string): Result<ParsedTimeline, ParseError> => {
  const lexed = timelineLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  timelineParser.input = lexed.tokens;
  const cst = timelineParser.timeline();
  if (timelineParser.errors.length > 0) {
    return err(recognitionError(timelineParser.errors));
  }
  return buildResult(cst, text);
};

export const parseTimeline = (text: string): Result<TimelineAst, ParseError> =>
  map(parseTimelineWithSource(text), (parsed) => parsed.ast);
