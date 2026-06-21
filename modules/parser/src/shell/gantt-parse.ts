import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, oneOrMore, type Result } from "@m/std";
import type {
  GanttAst,
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

type Children = Record<string, CstElement[] | undefined>;
const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];

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
  let section: string | null = null;
  const tasks: GanttTask[] = [];
  const taskSpans = new Map<GanttTaskId, TextSpan>();

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
      const fields = childTokens(taskLine.children, "BodyText")
        .map((t) => t.image.trim())
        .filter((s) => s !== "");
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
        start = { kind: "date", date: startRaw };
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
    }
  }

  return ok({ ast: { kind: "gantt", title, dateFormat, tasks }, source: { tasks: taskSpans } });
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
