import { createToken, Lexer, type TokenType } from "chevrotain";
import { CLASS_STMT, CLASSDEF_STMT, LINKSTYLE_STMT, STYLE_STMT } from "./style-patterns.js";

// Single-mode lexer: labels are always quoted, so no per-bracket modes are needed. Node kinds are
// keywords (so an id can't shadow a kind); `--` is the undirected link.
const Identifier = createToken({ name: "Identifier", pattern: /[A-Za-z0-9_]+/ });
const NetworkHeader = createToken({
  name: "NetworkHeader",
  pattern: /network/,
  longer_alt: Identifier,
});
const Server = createToken({ name: "Server", pattern: /server/, longer_alt: Identifier });
const Database = createToken({ name: "Database", pattern: /database/, longer_alt: Identifier });
const Cloud = createToken({ name: "Cloud", pattern: /cloud/, longer_alt: Identifier });
const Router = createToken({ name: "Router", pattern: /router/, longer_alt: Identifier });
const Switch = createToken({ name: "Switch", pattern: /switch/, longer_alt: Identifier });
const Firewall = createToken({ name: "Firewall", pattern: /firewall/, longer_alt: Identifier });
const Host = createToken({ name: "Host", pattern: /host/, longer_alt: Identifier });
const Group = createToken({ name: "NetGroup", pattern: /group/, longer_alt: Identifier });
const Icon = createToken({ name: "Icon", pattern: /icon/, longer_alt: Identifier });

const Dash = createToken({ name: "Dash", pattern: /--/ });
const Colon = createToken({ name: "Colon", pattern: /:/ });
const LBrace = createToken({ name: "NetLBrace", pattern: /\{/ });
const RBrace = createToken({ name: "NetRBrace", pattern: /\}/ });
const QuotedString = createToken({ name: "QuotedString", pattern: /"[^"\n]*"/ });
const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

// Mermaid styling directives (shared patterns), matched as whole lines before `Identifier` so a
// `classDef …`/`class …`/`style …`/`linkStyle …` line is captured whole rather than as bare tokens.
const StyleStmt = createToken({ name: "NetStyleStmt", pattern: STYLE_STMT });
const ClassDefStmt = createToken({ name: "NetClassDefStmt", pattern: CLASSDEF_STMT });
const ClassStmt = createToken({ name: "NetClassStmt", pattern: CLASS_STMT });
const LinkStyleStmt = createToken({ name: "NetLinkStyleStmt", pattern: LINKSTYLE_STMT });

const order: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  NetworkHeader,
  Server,
  Database,
  Cloud,
  Router,
  Switch,
  Firewall,
  Host,
  Group,
  Icon,
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

export const netLexer = new Lexer(order);

export const NetTok = {
  Identifier,
  StyleStmt,
  ClassDefStmt,
  ClassStmt,
  LinkStyleStmt,
  NetworkHeader,
  Server,
  Database,
  Cloud,
  Router,
  Switch,
  Firewall,
  Host,
  Group,
  Icon,
  Dash,
  Colon,
  LBrace,
  RBrace,
  QuotedString,
  NewLine,
  Semicolon,
};

export const netAllTokens: TokenType[] = order;
