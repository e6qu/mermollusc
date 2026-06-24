import { createToken, Lexer, type TokenType } from "chevrotain";

// Shapes/edge-text use per-bracket lexer modes (as in the flowchart lexer) so labels keep spaces.
const Identifier = createToken({ name: "Identifier", pattern: /[A-Za-z0-9_]+/ });
// `block:` opens a composite block; matched before `BlockHeader` so `block:id` isn't read as the
// `block` header plus a stray `:id`.
const BlockGroupOpen = createToken({ name: "BlockGroupOpen", pattern: /block:/ });
const BlockHeader = createToken({
  name: "BlockHeader",
  pattern: /block-beta|block/,
  longer_alt: Identifier,
});
const End = createToken({ name: "End", pattern: /end/, longer_alt: Identifier });
const Columns = createToken({ name: "Columns", pattern: /columns/, longer_alt: Identifier });
const Num = createToken({ name: "Number", pattern: /[0-9]+/, longer_alt: Identifier });
const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
// A leaf/composite column span: `a:2`, `block:id:3`. Distinct from `block:` (the `BlockGroupOpen`).
const Colon = createToken({ name: "BlockColon", pattern: /:/ });
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });
const Icon = createToken({ name: "BlockIcon", pattern: /icon/, longer_alt: Identifier });
const Quoted = createToken({ name: "BlockQuoted", pattern: /"[^"\n]*"/ });

const DottedArrow = createToken({ name: "DottedArrow", pattern: /-\.->/ });
const ThickArrow = createToken({ name: "ThickArrow", pattern: /={2,}>/ });
const Arrow = createToken({ name: "Arrow", pattern: /-{2,}>/ });
const OpenLink = createToken({ name: "OpenLink", pattern: /-{3,}/ });

const LSquare = createToken({ name: "LSquare", pattern: /\[/, push_mode: "square" });
const RSquare = createToken({ name: "RSquare", pattern: /\]/, pop_mode: true });
const SquareText = createToken({ name: "SquareText", pattern: /[^\]\n]+/ });

const LParen = createToken({ name: "LParen", pattern: /\(/, push_mode: "paren" });
const RParen = createToken({ name: "RParen", pattern: /\)/, pop_mode: true });
const ParenText = createToken({ name: "ParenText", pattern: /[^)\n]+/ });

const LCurly = createToken({ name: "LCurly", pattern: /\{/, push_mode: "curly" });
const RCurly = createToken({ name: "RCurly", pattern: /\}/, pop_mode: true });
const CurlyText = createToken({ name: "CurlyText", pattern: /[^}\n]+/ });

const Pipe = createToken({ name: "Pipe", pattern: /\|/, push_mode: "pipe" });
const PipeEnd = createToken({ name: "PipeEnd", pattern: /\|/, pop_mode: true });
const PipeText = createToken({ name: "PipeText", pattern: /[^|\n]+/ });

export const blockLexer = new Lexer({
  modes: {
    main: [
      WhiteSpace,
      Comment,
      NewLine,
      Semicolon,
      Colon,
      BlockGroupOpen,
      BlockHeader,
      End,
      Columns,
      Num,
      Icon,
      Quoted,
      DottedArrow,
      ThickArrow,
      Arrow,
      OpenLink,
      LSquare,
      LParen,
      LCurly,
      Pipe,
      Identifier,
    ],
    square: [RSquare, SquareText],
    paren: [RParen, ParenText],
    curly: [RCurly, CurlyText],
    pipe: [PipeEnd, PipeText],
  },
  defaultMode: "main",
});

export const BlockTok = {
  Identifier,
  BlockGroupOpen,
  BlockHeader,
  End,
  Columns,
  Number: Num,
  Icon,
  Quoted,
  NewLine,
  Semicolon,
  Colon,
  DottedArrow,
  ThickArrow,
  Arrow,
  OpenLink,
  LSquare,
  RSquare,
  SquareText,
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

export const blockAllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  Colon,
  BlockGroupOpen,
  BlockHeader,
  End,
  Columns,
  Num,
  Icon,
  Quoted,
  DottedArrow,
  ThickArrow,
  Arrow,
  OpenLink,
  LSquare,
  RSquare,
  SquareText,
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
