import { createToken, Lexer, type TokenType } from "chevrotain";

// Two modes: in `main` we lex the header, `showData`, `title`, quoted labels, the colon and numeric
// values; `title` pushes `titleMode`, where the rest of the line is one free-text `TitleText` and the
// newline pops back. (The title isn't quoted, so it needs its own mode to avoid clashing with values.)
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
const Pie = createToken({ name: "Pie", pattern: /pie\b/ });
const ShowData = createToken({ name: "ShowData", pattern: /showData\b/ });
const Donut = createToken({ name: "Donut", pattern: /donut\b/ });
const Title = createToken({ name: "Title", pattern: /title\b/, push_mode: "titleMode" });
const QuotedString = createToken({ name: "QuotedString", pattern: /"[^"\n]*"/ });
const Colon = createToken({ name: "Colon", pattern: /:/ });
const NumberLit = createToken({ name: "NumberLit", pattern: /[0-9]+(?:\.[0-9]+)?/ });

const TitleText = createToken({ name: "TitleText", pattern: /[^\n]+/ });
const TitleNewLine = createToken({
  name: "TitleNewLine",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
});

export const pieLexer = new Lexer({
  modes: {
    main: [
      Comment,
      WhiteSpace,
      NewLine,
      Pie,
      ShowData,
      Donut,
      Title,
      QuotedString,
      Colon,
      NumberLit,
    ],
    titleMode: [TitleNewLine, TitleText],
  },
  defaultMode: "main",
});

export const PieTok = {
  NewLine,
  Pie,
  ShowData,
  Donut,
  Title,
  QuotedString,
  Colon,
  NumberLit,
  TitleText,
  TitleNewLine,
};

export const pieAllTokens: TokenType[] = [
  Comment,
  WhiteSpace,
  NewLine,
  Pie,
  ShowData,
  Donut,
  Title,
  QuotedString,
  Colon,
  NumberLit,
  TitleText,
  TitleNewLine,
];
