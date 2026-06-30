import { createToken, Lexer, type TokenType } from "chevrotain";

// Transition / description label text (everything after `:` to end of line) is captured in a
// dedicated lexer mode, like the sequence parser's message text.
const Identifier = createToken({ name: "StateIdentifier", pattern: /[A-Za-z0-9_]+/ });
const StateDiagram = createToken({
  name: "StateDiagram",
  pattern: /stateDiagram-v2|stateDiagram/,
  longer_alt: Identifier,
});
const StateKw = createToken({ name: "StateKw", pattern: /state/, longer_alt: Identifier });
const Direction = createToken({
  name: "StateDirection",
  pattern: /direction/,
  longer_alt: Identifier,
});
const As = createToken({ name: "StateAs", pattern: /as/, longer_alt: Identifier });
const Note = createToken({ name: "StateNoteKw", pattern: /note/, longer_alt: Identifier });
const Over = createToken({ name: "StateOver", pattern: /over/, longer_alt: Identifier });
const LeftOf = createToken({ name: "StateLeftOf", pattern: /left of/, longer_alt: Identifier });
const RightOf = createToken({ name: "StateRightOf", pattern: /right of/, longer_alt: Identifier });
const Star = createToken({ name: "StateStar", pattern: /\[\*\]/ });
// A `<<fork>>` / `<<join>>` / `<<choice>>` state annotation; the inner keyword sets the state's kind.
const Annotation = createToken({
  name: "StateAnnotation",
  pattern: /<<\s*(?:fork|join|choice)\s*>>/,
});
const Arrow = createToken({ name: "StateArrow", pattern: /-->/ });
const LBrace = createToken({ name: "StateLBrace", pattern: /\{/ });
const RBrace = createToken({ name: "StateRBrace", pattern: /\}/ });
const QuotedString = createToken({ name: "StateQuotedString", pattern: /"(?:[^"\\]|\\.)*"/ });
const NewLine = createToken({ name: "StateNewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "StateSemicolon", pattern: /;/ });
const WhiteSpace = createToken({
  name: "StateWhiteSpace",
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});
const Comment = createToken({ name: "StateComment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

const Colon = createToken({ name: "StateColon", pattern: /:/, push_mode: "label" });
const LabelEnd = createToken({
  name: "StateLabelEnd",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
});
const LabelText = createToken({ name: "StateLabelText", pattern: /[^\n]+/ });

export const stateLexer = new Lexer({
  modes: {
    main: [
      WhiteSpace,
      Comment,
      NewLine,
      Semicolon,
      StateDiagram,
      StateKw,
      Direction,
      As,
      RightOf,
      LeftOf,
      Over,
      Note,
      Star,
      Annotation,
      Arrow,
      LBrace,
      RBrace,
      QuotedString,
      Colon,
      Identifier,
    ],
    label: [LabelEnd, LabelText],
  },
  defaultMode: "main",
});

export const StateTok = {
  Identifier,
  StateDiagram,
  StateKw,
  Direction,
  As,
  Note,
  Over,
  LeftOf,
  RightOf,
  Star,
  Annotation,
  Arrow,
  LBrace,
  RBrace,
  QuotedString,
  NewLine,
  Semicolon,
  Colon,
  LabelEnd,
  LabelText,
};

export const stateAllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  StateDiagram,
  StateKw,
  Direction,
  As,
  Star,
  Note,
  Over,
  LeftOf,
  RightOf,
  Annotation,
  Arrow,
  LBrace,
  RBrace,
  QuotedString,
  Colon,
  LabelEnd,
  LabelText,
  Identifier,
];
