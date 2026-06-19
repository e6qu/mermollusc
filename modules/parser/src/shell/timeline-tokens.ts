import { createToken, Lexer, type TokenType } from "chevrotain";

// Two-mode lexer. A line begins in `start`, where the leading keyword (`timeline`/`title`/`section`),
// a continuation `:`, or the period text is matched — each pushes `body`. Inside `body` the rest of
// the line is colon-separated free-text chunks (`BodyText`), and the newline pops back to `start`.
// This keeps the keywords special only at the line head while letting period/event text hold spaces
// and arbitrary words. The `\b` on each keyword means a period like `titles` stays free text.
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });
const StartWs = createToken({ name: "StartWs", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const StartNewLine = createToken({ name: "StartNewLine", pattern: /\r?\n/, line_breaks: true });

const Timeline = createToken({ name: "Timeline", pattern: /timeline\b/, push_mode: "body" });
const Title = createToken({ name: "Title", pattern: /title\b/, push_mode: "body" });
const Section = createToken({ name: "Section", pattern: /section\b/, push_mode: "body" });
const LeadColon = createToken({ name: "LeadColon", pattern: /:/, push_mode: "body" });
const PeriodText = createToken({ name: "PeriodText", pattern: /[^:\n]+/, push_mode: "body" });

const BodyNewLine = createToken({
  name: "BodyNewLine",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
});
const Colon = createToken({ name: "Colon", pattern: /:/ });
const BodyText = createToken({ name: "BodyText", pattern: /[^:\n]+/ });

export const timelineLexer = new Lexer({
  modes: {
    start: [Comment, StartWs, StartNewLine, Timeline, Title, Section, LeadColon, PeriodText],
    body: [BodyNewLine, Colon, BodyText],
  },
  defaultMode: "start",
});

export const TlTok = {
  StartNewLine,
  Timeline,
  Title,
  Section,
  LeadColon,
  PeriodText,
  BodyNewLine,
  Colon,
  BodyText,
};

export const timelineAllTokens: TokenType[] = [
  Comment,
  StartWs,
  StartNewLine,
  Timeline,
  Title,
  Section,
  LeadColon,
  PeriodText,
  BodyNewLine,
  Colon,
  BodyText,
];
