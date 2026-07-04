import { createToken, Lexer, type TokenType } from "chevrotain";
import { CLASS_STMT, CLASSDEF_STMT, LINKSTYLE_STMT, STYLE_STMT } from "./style-patterns.js";

// Single-mode lexer (labels always quoted). `group` opens a nested box; the kind keywords introduce
// service leaves; `--` is the undirected link.
const Identifier = createToken({ name: "CloudIdentifier", pattern: /[A-Za-z0-9_]+/ });
const CloudHeader = createToken({ name: "CloudHeader", pattern: /cloud/, longer_alt: Identifier });
const Group = createToken({ name: "Group", pattern: /group/, longer_alt: Identifier });
const Compute = createToken({ name: "Compute", pattern: /compute/, longer_alt: Identifier });
const Storage = createToken({ name: "Storage", pattern: /storage/, longer_alt: Identifier });
const Database = createToken({
  name: "CloudDatabase",
  pattern: /database/,
  longer_alt: Identifier,
});
const Queue = createToken({ name: "CloudQueue", pattern: /queue/, longer_alt: Identifier });
const Cdn = createToken({ name: "Cdn", pattern: /cdn/, longer_alt: Identifier });
const Icon = createToken({ name: "CloudIcon", pattern: /icon/, longer_alt: Identifier });

// `-->` (directed traffic edge) precedes `--` in the token order so the lexer doesn't match the `--`
// prefix first.
const Arrow = createToken({ name: "CloudArrow", pattern: /-->/ });
const Dash = createToken({ name: "CloudDash", pattern: /--/ });
const Colon = createToken({ name: "CloudColon", pattern: /:/ });
const LBrace = createToken({ name: "CloudLBrace", pattern: /\{/ });
const RBrace = createToken({ name: "CloudRBrace", pattern: /\}/ });
const QuotedString = createToken({ name: "CloudQuoted", pattern: /"[^"\n]*"/ });
const NewLine = createToken({ name: "CloudNewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "CloudSemicolon", pattern: /;/ });
const WhiteSpace = createToken({
  name: "CloudWhiteSpace",
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});
const Comment = createToken({ name: "CloudComment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

// Mermaid styling directives (shared patterns), matched as whole lines before `Identifier` so a
// `classDef …`/`class …`/`style …`/`linkStyle …` line is captured whole rather than as bare tokens.
const StyleStmt = createToken({ name: "CloudStyleStmt", pattern: STYLE_STMT });
const ClassDefStmt = createToken({ name: "CloudClassDefStmt", pattern: CLASSDEF_STMT });
const ClassStmt = createToken({ name: "CloudClassStmt", pattern: CLASS_STMT });
const LinkStyleStmt = createToken({ name: "CloudLinkStyleStmt", pattern: LINKSTYLE_STMT });

const order: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  CloudHeader,
  Group,
  Compute,
  Storage,
  Database,
  Queue,
  Cdn,
  Icon,
  Arrow,
  Dash,
  Colon,
  LBrace,
  RBrace,
  QuotedString,
  StyleStmt,
  ClassDefStmt,
  ClassStmt,
  LinkStyleStmt,
  Identifier,
];

export const cloudLexer = new Lexer(order);

export const CloudTok = {
  Identifier,
  StyleStmt,
  ClassDefStmt,
  ClassStmt,
  LinkStyleStmt,
  CloudHeader,
  Group,
  Compute,
  Storage,
  Database,
  Queue,
  Cdn,
  Icon,
  Arrow,
  Dash,
  Colon,
  LBrace,
  RBrace,
  QuotedString,
  NewLine,
  Semicolon,
};

export const cloudAllTokens: TokenType[] = order;
