import { createToken, Lexer, type TokenType } from "chevrotain";

// Relationship label text (after `:`) is captured in a dedicated mode, like the sequence parser.
// Entity names allow hyphens (e.g. LINE-ITEM); the cardinality operator is lexed as one token.
const Identifier = createToken({ name: "ErIdentifier", pattern: /[A-Za-z_][\w-]*/ });
const ErDiagram = createToken({ name: "ErDiagram", pattern: /erDiagram/, longer_alt: Identifier });
// `<leftCard><line><rightCard>` — e.g. `||--o{`, `}o..o|`. Lexed whole so its `|`/`}`/`o` can't be
// mistaken for anything else; the three parts are split out in the CST→AST step.
const Relationship = createToken({
  name: "ErRelationship",
  pattern: /(?:\|o|\|\||\}o|\}\|)(?:--|\.\.)(?:o\||\|\||o\{|\|\{)/,
});
const QuotedString = createToken({ name: "ErQuotedString", pattern: /"(?:[^"\\]|\\.)*"/ });
const NewLine = createToken({ name: "ErNewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "ErSemicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "ErWhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "ErComment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

const Colon = createToken({ name: "ErColon", pattern: /:/, push_mode: "label" });
const LabelEnd = createToken({
  name: "ErLabelEnd",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
});
const LabelText = createToken({ name: "ErLabelText", pattern: /[^\n]+/ });

export const erLexer = new Lexer({
  modes: {
    main: [
      WhiteSpace,
      Comment,
      NewLine,
      Semicolon,
      ErDiagram,
      Relationship,
      QuotedString,
      Colon,
      Identifier,
    ],
    label: [LabelEnd, LabelText],
  },
  defaultMode: "main",
});

export const ErTok = {
  Identifier,
  ErDiagram,
  Relationship,
  QuotedString,
  NewLine,
  Semicolon,
  Colon,
  LabelEnd,
  LabelText,
};

export const erAllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  ErDiagram,
  Relationship,
  QuotedString,
  Colon,
  LabelEnd,
  LabelText,
  Identifier,
];
