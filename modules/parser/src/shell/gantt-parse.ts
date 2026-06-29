import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens } from "./cst.js";
import { brand, err, map, ok, oneOrMore, positiveInt, type Result } from "@m/std";
import { ganttDate } from "@m/contracts";
import type {
  GanttAst,
  GanttDate,
  GanttSource,
  GanttStart,
  GanttStatus,
  GanttTask,
  GanttTaskId,
  TextSpan,
} from "@m/contracts";
import { lexingError, parseErrorAt, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { ganttParser } from "./gantt-grammar.js";
import { ganttLexer } from "./gantt-tokens.js";

export interface ParsedGantt {
  readonly ast: GanttAst;
  readonly source: GanttSource;
}

const trimmedSpan = (t: IToken): TextSpan => {
  const lead = t.image.length - t.image.trimStart().length;
  const trail = t.image.length - t.image.trimEnd().length;
  return { start: t.startOffset + lead, end: t.startOffset + t.image.length - trail };
};

// Everything after the keyword to the line end, straight from the source so any colons/commas in the
// value survive (the lexer would otherwise split on them).
const lineValue = (text: string, keyword: IToken): string => {
  const start =
    keyword.endOffset === undefined
      ? keyword.startOffset + keyword.image.length
      : keyword.endOffset + 1;
  const nl = text.indexOf("\n", start);
  return text.slice(start, nl === -1 ? text.length : nl).trim();
};

const isStatus = (s: string): s is Exclude<GanttStatus, "normal"> =>
  s === "done" || s === "active" || s === "crit";

// `tickInterval <n>[unit]` → a positive whole number of days (week = 7, day = 1; a bare number is days),
// else null. A `month` unit isn't supported in the day-grid model — it would parse to null and fail loudly.
const tickIntervalToDays = (s: string): number | null => {
  const m = /^(\d+)\s*(weeks?|w|days?|d)?$/i.exec(s.trim());
  if (m === null) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return (m[2] ?? "d").toLowerCase().startsWith("w") ? n * 7 : n;
};

// `<n>` / `<n>d` / `<n>w` / `<n>h` → a positive number of days, else null (a week is 7 days, an hour 1/24).
const durationDays = (s: string): number | null => {
  const m = /^(\d+(?:\.\d+)?)\s*([dwh])?$/i.exec(s);
  if (m === null) return null;
  const n = Number(m[1]);
  if (!(n >= 0)) return null; // a milestone is `0d`; a task's positive duration is enforced by the caller
  const unit = (m[2] ?? "d").toLowerCase();
  return unit === "w" ? n * 7 : unit === "h" ? n / 24 : n;
};

const buildResult = (cst: CstNode, text: string): Result<ParsedGantt, ParseError> => {
  const root = cst.children;
  let title: string | null = null;
  let dateFormat: string | null = null;
  let tickIntervalDays = 7; // weekly by default; the `tickInterval` directive overrides it
  let section: string | null = null;
  let excludesWeekends = false;
  const excludeDates: GanttDate[] = [];
  const tasks: GanttTask[] = [];
  const taskSpans = new Map<GanttTaskId, TextSpan>();
  const startFieldSpans = new Map<GanttTaskId, TextSpan>();
  const startSpans = new Map<GanttTaskId, TextSpan>();
  const durationSpans = new Map<GanttTaskId, TextSpan>();

  for (const stmt of childNodes(root, "ganttStatement")) {
    const sc = stmt.children;

    const titleLine = childNodes(sc, "titleLine")[0];
    if (titleLine !== undefined) {
      const kw = childTokens(titleLine.children, "Title")[0];
      if (kw !== undefined) title = lineValue(text, kw);
      continue;
    }

    const dfLine = childNodes(sc, "dateFormatLine")[0];
    if (dfLine !== undefined) {
      const kw = childTokens(dfLine.children, "DateFormat")[0];
      if (kw !== undefined) dateFormat = lineValue(text, kw) || null;
      continue;
    }

    const tickLine = childNodes(sc, "tickIntervalLine")[0];
    if (tickLine !== undefined) {
      const kw = childTokens(tickLine.children, "TickInterval")[0];
      if (kw !== undefined) {
        const value = lineValue(text, kw);
        const days = tickIntervalToDays(value);
        if (days === null) {
          return err(
            parseErrorAt(
              `gantt: invalid tickInterval "${value}" (e.g. 1week, 3days)`,
              kw.startOffset,
              kw.image.length,
            ),
          );
        }
        tickIntervalDays = days;
      }
      continue;
    }

    const exLine = childNodes(sc, "excludesLine")[0];
    if (exLine !== undefined) {
      const kw = childTokens(exLine.children, "Excludes")[0];
      // Tokens are space/comma-separated: the literal `weekends`, or a date (a holiday). Each date is
      // validated here through `ganttDate`, so a malformed holiday fails the parse loudly.
      const value = kw === undefined ? "" : lineValue(text, kw);
      const at = kw === undefined ? 0 : kw.startOffset;
      const len = kw === undefined ? 0 : kw.image.length;
      for (const tok of value.split(/[\s,]+/).filter((s) => s !== "")) {
        if (tok === "weekends") {
          excludesWeekends = true;
          continue;
        }
        const date = ganttDate(tok);
        if (date === null) {
          return err(
            parseErrorAt(`gantt: invalid excluded date "${tok}" (expected YYYY-MM-DD)`, at, len),
          );
        }
        excludeDates.push(date);
      }
      continue;
    }

    const sectionLine = childNodes(sc, "sectionLine")[0];
    if (sectionLine !== undefined) {
      const kw = childTokens(sectionLine.children, "Section")[0];
      const value = kw === undefined ? "" : lineValue(text, kw);
      section = value === "" ? null : value;
      continue;
    }

    const taskLine = childNodes(sc, "taskLine")[0];
    if (taskLine !== undefined) {
      const labelTok = childTokens(taskLine.children, "TaskLabel")[0];
      if (labelTok === undefined) continue;
      const label = labelTok.image.trim();
      const labelLen = labelTok.image.trimEnd().length;
      // Comma-separated meta fields, in order: [status…][id], start, duration.
      const fieldToks = childTokens(taskLine.children, "BodyText").filter(
        (t) => t.image.trim() !== "",
      );
      const fields = fieldToks.map((t) => t.image.trim());
      if (fields.length < 2) {
        return err(
          parseErrorAt(
            `gantt: task "${label}" needs a start and a duration`,
            labelTok.startOffset,
            labelLen,
          ),
        );
      }
      const durRaw = fields[fields.length - 1] ?? "";
      const dur = durationDays(durRaw);
      if (dur === null) {
        return err(
          parseErrorAt(
            `gantt: "${durRaw}" is not a valid duration (e.g. 5d, 2w)`,
            labelTok.startOffset,
            labelLen,
          ),
        );
      }
      const startRaw = fields[fields.length - 2] ?? "";
      const lead = fields.slice(0, fields.length - 2);
      const milestone = lead.includes("milestone");
      // A milestone is a point (0d); an ordinary task must have a positive duration.
      if (!milestone && dur === 0) {
        return err(
          parseErrorAt(
            `gantt: task "${label}" needs a positive duration (only a milestone is 0d)`,
            labelTok.startOffset,
            labelLen,
          ),
        );
      }
      const status: GanttStatus = lead.find(isStatus) ?? "normal";
      const idField = lead.find((f) => !isStatus(f) && f !== "milestone");
      const id = brand<string, "GanttTaskId">(idField ?? `t${tasks.length}`);
      // `after a b c` — one or more predecessor ids; the task starts at the latest one's end.
      const after = /^after\s+(\S.*)$/.exec(startRaw);
      let start: GanttStart;
      if (after !== null) {
        const refs = (after[1] ?? "")
          .split(/\s+/)
          .filter((s) => s !== "")
          .map((s) => brand<string, "GanttTaskId">(s));
        const first = refs[0];
        if (first === undefined) {
          return err(
            parseErrorAt(
              `gantt: task "${label}" has an empty "after" (expected one or more task ids)`,
              labelTok.startOffset,
              labelLen,
            ),
          );
        }
        start = { kind: "after", refs: oneOrMore(first, ...refs.slice(1)) };
      } else {
        const date = ganttDate(startRaw);
        if (date === null) {
          return err(
            parseErrorAt(
              `gantt: task "${label}" has an invalid start date "${startRaw}" (expected YYYY-MM-DD)`,
              labelTok.startOffset,
              labelLen,
            ),
          );
        }
        start = { kind: "date", date };
      }
      tasks.push({
        id,
        label,
        section,
        status,
        start,
        milestone,
        durationDays: milestone ? 0 : dur,
      });
      taskSpans.set(id, trimmedSpan(labelTok));
      // Spans of the start + duration fields, so a bar drag/resize can rewrite them. Start is recorded
      // only for an explicit date (an `after` chain has no calendar position to slide).
      const durTok = fieldToks[fieldToks.length - 1];
      const startTok = fieldToks[fieldToks.length - 2];
      if (durTok !== undefined) durationSpans.set(id, trimmedSpan(durTok));
      if (startTok !== undefined) startFieldSpans.set(id, trimmedSpan(startTok));
      if (start.kind === "date" && startTok !== undefined)
        startSpans.set(id, trimmedSpan(startTok));
    }
  }

  return ok({
    ast: {
      kind: "gantt",
      title,
      dateFormat,
      tickIntervalDays: positiveInt(tickIntervalDays),
      excludesWeekends,
      excludeDates,
      tasks,
    },
    source: {
      tasks: taskSpans,
      taskStartField: startFieldSpans,
      taskStart: startSpans,
      taskDuration: durationSpans,
    },
  });
};

export const parseGanttWithSource = (text: string): Result<ParsedGantt, ParseError> => {
  const lexed = ganttLexer.tokenize(text);
  if (lexed.errors.length > 0) return err(lexingError(lexed.errors));
  ganttParser.input = lexed.tokens;
  const cst = ganttParser.gantt();
  if (ganttParser.errors.length > 0) return err(recognitionError(ganttParser.errors));
  return buildResult(cst, text);
};

export const parseGantt = (text: string): Result<GanttAst, ParseError> =>
  map(parseGanttWithSource(text), (parsed) => parsed.ast);
