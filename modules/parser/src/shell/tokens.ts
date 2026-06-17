import { createToken, Lexer, type TokenType } from "chevrotain";

// Label/edge-text is captured by per-bracket lexer modes so it may contain spaces.
const Identifier = createToken({ name: "Identifier", pattern: /[A-Za-z0-9_]+/ });
const Graph = createToken({ name: "Graph", pattern: /flowchart|graph/, longer_alt: Identifier });
// `subgraph … end` grouping keywords. `longer_alt: Identifier` so `subgraphs`/`endpoint` stay ids.
const Subgraph = createToken({ name: "Subgraph", pattern: /subgraph/, longer_alt: Identifier });
const End = createToken({ name: "End", pattern: /end/, longer_alt: Identifier });
const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

const DottedArrow = createToken({ name: "DottedArrow", pattern: /-\.->/ });
const ThickArrow = createToken({ name: "ThickArrow", pattern: /={2,}>/ });
const Arrow = createToken({ name: "Arrow", pattern: /-{2,}>/ });
const OpenLink = createToken({ name: "OpenLink", pattern: /-{3,}/ });

const LSquare = createToken({ name: "LSquare", pattern: /\[/, push_mode: "square" });
const RSquare = createToken({ name: "RSquare", pattern: /\]/, pop_mode: true });
const SquareText = createToken({ name: "SquareText", pattern: /[^\]\n]+/ });

// Stadium `([text])` and circle `((text))` share the `(` prefix with round `(text)`, so their
// two-char openers must be tried before LParen in the main mode (Chevrotain matches in array order,
// not by longest match). Each text token stops at its closing bracket so the closer can pop.
const LStadium = createToken({ name: "LStadium", pattern: /\(\[/, push_mode: "stadium" });
const RStadium = createToken({ name: "RStadium", pattern: /\]\)/, pop_mode: true });
const StadiumText = createToken({ name: "StadiumText", pattern: /[^\]\n]+/ });

const LCircle = createToken({ name: "LCircle", pattern: /\(\(/, push_mode: "circle" });
const RCircle = createToken({ name: "RCircle", pattern: /\)\)/, pop_mode: true });
const CircleText = createToken({ name: "CircleText", pattern: /[^)\n]+/ });

const LParen = createToken({ name: "LParen", pattern: /\(/, push_mode: "paren" });
const RParen = createToken({ name: "RParen", pattern: /\)/, pop_mode: true });
const ParenText = createToken({ name: "ParenText", pattern: /[^)\n]+/ });

const LCurly = createToken({ name: "LCurly", pattern: /\{/, push_mode: "curly" });
const RCurly = createToken({ name: "RCurly", pattern: /\}/, pop_mode: true });
const CurlyText = createToken({ name: "CurlyText", pattern: /[^}\n]+/ });

const Pipe = createToken({ name: "Pipe", pattern: /\|/, push_mode: "pipe" });
const PipeEnd = createToken({ name: "PipeEnd", pattern: /\|/, pop_mode: true });
const PipeText = createToken({ name: "PipeText", pattern: /[^|\n]+/ });

export const lexer = new Lexer({
  modes: {
    main: [
      WhiteSpace,
      Comment,
      NewLine,
      Semicolon,
      Graph,
      Subgraph,
      End,
      DottedArrow,
      ThickArrow,
      Arrow,
      OpenLink,
      LSquare,
      LStadium,
      LCircle,
      LParen,
      LCurly,
      Pipe,
      Identifier,
    ],
    square: [RSquare, SquareText],
    stadium: [RStadium, StadiumText],
    circle: [RCircle, CircleText],
    paren: [RParen, ParenText],
    curly: [RCurly, CurlyText],
    pipe: [PipeEnd, PipeText],
  },
  defaultMode: "main",
});

export const Tok = {
  Identifier,
  Graph,
  NewLine,
  Semicolon,
  Subgraph,
  End,
  DottedArrow,
  ThickArrow,
  Arrow,
  OpenLink,
  LSquare,
  RSquare,
  SquareText,
  LStadium,
  RStadium,
  StadiumText,
  LCircle,
  RCircle,
  CircleText,
  LParen,
  RParen,
  ParenText,
  LCurly,
  RCurly,
  CurlyText,
  Pipe,
  PipeEnd,
  PipeText,
};

export const allTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  Graph,
  Subgraph,
  End,
  DottedArrow,
  ThickArrow,
  Arrow,
  OpenLink,
  LSquare,
  RSquare,
  SquareText,
  LStadium,
  RStadium,
  StadiumText,
  LCircle,
  RCircle,
  CircleText,
  LParen,
  RParen,
  ParenText,
  LCurly,
  RCurly,
  CurlyText,
  Pipe,
  PipeEnd,
  PipeText,
  Identifier,
];
