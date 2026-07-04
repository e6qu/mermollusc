import { createToken, Lexer, type TokenType } from "chevrotain";
import { CLASS_SHORTHAND, CLASSDEF_STMT, LINKSTYLE_STMT, STYLE_STMT } from "./style-patterns.js";

// Class names are identifiers with an optional generic suffix (`List~T~`, `Map~K,V~`) — Mermaid's
// `~…~` generics. Members inside a `{ … }` body are captured as whole lines in a dedicated mode (like
// the sequence/ER label modes), so member text — visibility marks, types, `()`, generics, even `:`
// return types — never has to be tokenised piecewise. The `:` shorthand and relationship labels
// capture to end-of-line in the same way.
const Identifier = createToken({
  name: "ClassIdentifier",
  pattern: /[A-Za-z_]\w*(?:~[^~\n]+~)?/,
});
const ClassDiagram = createToken({
  name: "ClassDiagram",
  pattern: /classDiagram(?:-v2)?/,
  longer_alt: Identifier,
});
const ClassKw = createToken({ name: "ClassKw", pattern: /class/, longer_alt: Identifier });
// Class-diagram styling. `classDef`/`style`/`linkStyle` are whole-line directives (shared patterns),
// tried before `ClassKw` so `classDef …` isn't read as a `class` declaration. Class ASSIGNMENT here is
// Mermaid's `cssClass "A,B" name` statement or the inline `:::name` — never a bare `class A name`, which
// would collide with a declaration. `cssClass` is a distinct keyword (`css…`, not `class…`).
const StyleStmt = createToken({ name: "ClassStyleStmt", pattern: STYLE_STMT });
const ClassDefStmt = createToken({ name: "ClassClassDefStmt", pattern: CLASSDEF_STMT });
const LinkStyleStmt = createToken({ name: "ClassLinkStyleStmt", pattern: LINKSTYLE_STMT });
const CssClass = createToken({
  name: "ClassCssClass",
  pattern: /cssClass/,
  longer_alt: Identifier,
});
const ClassShorthand = createToken({ name: "ClassShorthand", pattern: CLASS_SHORTHAND });
// `[<leftHead>](--|..)[<rightHead>]` — e.g. `<|--`, `--|>`, `*--`, `o--`, `-->`, `..>`, `..|>`, `--`.
// Lexed whole and split in the CST→AST step. Heads: `<|`/`|>` triangle, `*` filled diamond, `o`
// hollow diamond, `<`/`>` open arrow.
const Relationship = createToken({
  name: "ClassRelationship",
  pattern: /(?:<\||<|\*|o)?(?:--|\.\.)(?:\|>|>|\*|o)?/,
});
const QuotedString = createToken({ name: "ClassQuotedString", pattern: /"(?:[^"\\]|\\.)*"/ });
const Stereotype = createToken({
  name: "ClassStereotype",
  pattern: /<<[^>\n]+>>/,
});
const NewLine = createToken({ name: "ClassNewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "ClassSemicolon", pattern: /;/ });
const WhiteSpace = createToken({
  name: "ClassWhiteSpace",
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});
const Comment = createToken({ name: "ClassComment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

const LBrace = createToken({ name: "ClassLBrace", pattern: /\{/, push_mode: "body" });
const Colon = createToken({ name: "ClassColon", pattern: /:/, push_mode: "label" });

// body mode: each member is a whole line; `}` (popping) and newlines bound them.
const RBrace = createToken({ name: "ClassRBrace", pattern: /\}/, pop_mode: true });
const BodyNewLine = createToken({ name: "ClassBodyNewLine", pattern: /\r?\n/, line_breaks: true });
const MemberText = createToken({ name: "ClassMemberText", pattern: /[^\n}]+/ });

// label mode: the `: …` text of a relationship or the `Foo : member` shorthand, to end of line.
const LabelEnd = createToken({
  name: "ClassLabelEnd",
  pattern: /\r?\n/,
  line_breaks: true,
  pop_mode: true,
});
const LabelText = createToken({ name: "ClassLabelText", pattern: /[^\n]+/ });

export const classLexer = new Lexer({
  modes: {
    main: [
      WhiteSpace,
      Comment,
      NewLine,
      Semicolon,
      ClassDiagram,
      StyleStmt,
      ClassDefStmt,
      LinkStyleStmt,
      CssClass,
      ClassKw,
      Relationship,
      LBrace,
      ClassShorthand,
      Colon,
      QuotedString,
      Stereotype,
      Identifier,
    ],
    body: [RBrace, BodyNewLine, MemberText],
    label: [LabelEnd, LabelText],
  },
  defaultMode: "main",
});

export const ClassTok = {
  Identifier,
  ClassDiagram,
  StyleStmt,
  ClassDefStmt,
  LinkStyleStmt,
  CssClass,
  ClassShorthand,
  ClassKw,
  Relationship,
  QuotedString,
  Stereotype,
  NewLine,
  Semicolon,
  LBrace,
  Colon,
  RBrace,
  BodyNewLine,
  MemberText,
  LabelEnd,
  LabelText,
};

export const classAllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  ClassDiagram,
  StyleStmt,
  ClassDefStmt,
  LinkStyleStmt,
  CssClass,
  ClassShorthand,
  ClassKw,
  Relationship,
  LBrace,
  Colon,
  RBrace,
  BodyNewLine,
  MemberText,
  LabelEnd,
  LabelText,
  QuotedString,
  Stereotype,
  Identifier,
];
