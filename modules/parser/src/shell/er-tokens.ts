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
const LBrace = createToken({ name: "ErLBrace", pattern: /\{/ });
const RBrace = createToken({ name: "ErRBrace", pattern: /\}/ });
const NewLine = createToken({ name: "ErNewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "ErSemicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "ErWhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
// Commas only separate attribute keys (`PK,FK`); skipping them lets each key lex as an identifier.
const Comma = createToken({ name: "ErComma", pattern: /,/, group: Lexer.SKIPPED });
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
      Comma,
      NewLine,
      Semicolon,
      ErDiagram,
      // Relationship (`}o..||`) before RBrace so a leading `}` is read as the operator, not a brace.
      Relationship,
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

export const ErTok = {
  Identifier,
  ErDiagram,
  Relationship,
  QuotedString,
  LBrace,
  RBrace,
  NewLine,
  Semicolon,
  Colon,
  LabelEnd,
  LabelText,
};

export const erAllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  Comma,
  NewLine,
  Semicolon,
  ErDiagram,
  Relationship,
  LBrace,
  RBrace,
  QuotedString,
  Colon,
  LabelEnd,
  LabelText,
  Identifier,
];
