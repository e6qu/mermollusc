import { createToken, Lexer, type TokenType } from "chevrotain";

// Single-mode lexer for the gitGraph subset. Commands (`commit`/`branch`/`checkout`/`switch`/
// `merge`) and attribute keys (`id`/`tag`/`type`) are keyword tokens with `longer_alt: Identifier`
// so an identifier that merely starts with one (e.g. `mergeable`) stays an identifier. Branch names
// and string values are bare identifiers or quoted strings.
const Identifier = createToken({ name: "Identifier", pattern: /[A-Za-z0-9_]+/ });
const GitGraphHeader = createToken({
  name: "GitGraphHeader",
  pattern: /gitGraph/,
  longer_alt: Identifier,
});
const Commit = createToken({ name: "Commit", pattern: /commit/, longer_alt: Identifier });
const Branch = createToken({ name: "Branch", pattern: /branch/, longer_alt: Identifier });
const Checkout = createToken({ name: "Checkout", pattern: /checkout/, longer_alt: Identifier });
const Switch = createToken({ name: "Switch", pattern: /switch/, longer_alt: Identifier });
const Merge = createToken({ name: "Merge", pattern: /merge/, longer_alt: Identifier });
const Id = createToken({ name: "Id", pattern: /id/, longer_alt: Identifier });
const Tag = createToken({ name: "Tag", pattern: /tag/, longer_alt: Identifier });
const Type = createToken({ name: "Type", pattern: /type/, longer_alt: Identifier });
const Normal = createToken({ name: "Normal", pattern: /NORMAL/, longer_alt: Identifier });
const Reverse = createToken({ name: "Reverse", pattern: /REVERSE/, longer_alt: Identifier });
const Highlight = createToken({ name: "Highlight", pattern: /HIGHLIGHT/, longer_alt: Identifier });
const DirLR = createToken({ name: "DirLR", pattern: /LR/, longer_alt: Identifier });
const DirTB = createToken({ name: "DirTB", pattern: /TB/, longer_alt: Identifier });
const DirBT = createToken({ name: "DirBT", pattern: /BT/, longer_alt: Identifier });

const Colon = createToken({ name: "Colon", pattern: /:/ });
const QuotedString = createToken({ name: "QuotedString", pattern: /"[^"\n]*"/ });
const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

// Direction keywords precede the command keywords (all longer_alt Identifier); the two-letter
// directions can't be confused with the multi-letter commands, and either way the longest match wins.
const order: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  GitGraphHeader,
  Commit,
  Branch,
  Checkout,
  Switch,
  Merge,
  Id,
  Tag,
  Type,
  Normal,
  Reverse,
  Highlight,
  DirLR,
  DirTB,
  DirBT,
  Colon,
  QuotedString,
  Identifier,
];

export const gitLexer = new Lexer(order);

export const GitTok = {
  Identifier,
  GitGraphHeader,
  Commit,
  Branch,
  Checkout,
  Switch,
  Merge,
  Id,
  Tag,
  Type,
  Normal,
  Reverse,
  Highlight,
  DirLR,
  DirTB,
  DirBT,
  Colon,
  QuotedString,
  NewLine,
  Semicolon,
};

export const gitAllTokens: TokenType[] = order;
