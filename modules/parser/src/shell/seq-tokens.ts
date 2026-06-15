import { createToken, Lexer, type TokenType } from "chevrotain";

// Message text (everything after `:` to end of line) is captured in a dedicated lexer mode.
const Identifier = createToken({ name: "SeqIdentifier", pattern: /[A-Za-z0-9_]+/ });
const SequenceDiagram = createToken({
  name: "SequenceDiagram",
  pattern: /sequenceDiagram/,
  longer_alt: Identifier,
});
const Participant = createToken({
  name: "Participant",
  pattern: /participant/,
  longer_alt: Identifier,
});
const As = createToken({ name: "As", pattern: /as/, longer_alt: Identifier });
const NewLine = createToken({ name: "SeqNewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "SeqSemicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "SeqWhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "SeqComment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

const DashedArrow = createToken({ name: "DashedArrow", pattern: /-->>/ });
const SolidArrow = createToken({ name: "SolidArrow", pattern: /->>/ });
const DashedOpen = createToken({ name: "DashedOpen", pattern: /-->/ });
const SolidOpen = createToken({ name: "SolidOpen", pattern: /->/ });

const Colon = createToken({ name: "Colon", pattern: /:/, push_mode: "message" });
const MsgEnd = createToken({ name: "MsgEnd", pattern: /\r?\n/, line_breaks: true, pop_mode: true });
const MsgText = createToken({ name: "MsgText", pattern: /[^\n]+/ });

export const seqLexer = new Lexer({
  modes: {
    main: [
      WhiteSpace,
      Comment,
      NewLine,
      Semicolon,
      SequenceDiagram,
      Participant,
      As,
      DashedArrow,
      SolidArrow,
      DashedOpen,
      SolidOpen,
      Colon,
      Identifier,
    ],
    message: [MsgEnd, MsgText],
  },
  defaultMode: "main",
});

export const SeqTok = {
  Identifier,
  SequenceDiagram,
  Participant,
  As,
  NewLine,
  Semicolon,
  DashedArrow,
  SolidArrow,
  DashedOpen,
  SolidOpen,
  Colon,
  MsgEnd,
  MsgText,
};

export const seqAllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  SequenceDiagram,
  Participant,
  As,
  DashedArrow,
  SolidArrow,
  DashedOpen,
  SolidOpen,
  Colon,
  MsgEnd,
  MsgText,
  Identifier,
];
