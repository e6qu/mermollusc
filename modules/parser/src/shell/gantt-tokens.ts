import { createToken, Lexer, type TokenType } from "chevrotain";

// Two-mode lexer, like the timeline's. A line begins in `start`, where a leading keyword
// (`gantt`/`title`/`dateFormat`/`section`) or a task label (the text up to the first `:`) is matched —
// each pushes `body`. Inside `body` the rest of the line is the keyword's value or, for a task, the
// comma-separated meta (`status, id, start, duration`); the newline pops back to `start`. Keywords use
// `\b` so a task literally named e.g. `titled` stays a label.
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });
const StartWs = createToken({ name: "StartWs", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const StartNewLine = createToken({ name: "StartNewLine", pattern: /\r?\n/, line_breaks: true });

const Gantt = createToken({ name: "Gantt", pattern: /gantt\b/, push_mode: "body" });
const Title = createToken({ name: "Title", pattern: /title\b/, push_mode: "body" });
const DateFormat = createToken({ name: "DateFormat", pattern: /dateFormat\b/, push_mode: "body" });
const Section = createToken({ name: "Section", pattern: /section\b/, push_mode: "body" });
const TaskLabel = createToken({ name: "TaskLabel", pattern: /[^:\n]+/, push_mode: "body" });

const BodyNewLine = createToken({
  name: "BodyNewLine",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
});
const Colon = createToken({ name: "Colon", pattern: /:/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const BodyText = createToken({ name: "BodyText", pattern: /[^,:\n]+/ });

export const ganttLexer = new Lexer({
  modes: {
    start: [Comment, StartWs, StartNewLine, Gantt, Title, DateFormat, Section, TaskLabel],
    body: [BodyNewLine, Colon, Comma, BodyText],
  },
  defaultMode: "start",
});

export const GtTok = {
  StartNewLine,
  Gantt,
  Title,
  DateFormat,
  Section,
  TaskLabel,
  BodyNewLine,
  Colon,
  Comma,
  BodyText,
};

export const ganttAllTokens: TokenType[] = [
  Comment,
  StartWs,
  StartNewLine,
  Gantt,
  Title,
  DateFormat,
  Section,
  TaskLabel,
  BodyNewLine,
  Colon,
  Comma,
  BodyText,
];
