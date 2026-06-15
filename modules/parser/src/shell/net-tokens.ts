import { createToken, Lexer, type TokenType } from "chevrotain";

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

const Dash = createToken({ name: "Dash", pattern: /--/ });
const Colon = createToken({ name: "Colon", pattern: /:/ });
const QuotedString = createToken({ name: "QuotedString", pattern: /"[^"\n]*"/ });
const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

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
  Dash,
  Colon,
  QuotedString,
  Identifier,
];

export const netLexer = new Lexer(order);

export const NetTok = {
  Identifier,
  NetworkHeader,
  Server,
  Database,
  Cloud,
  Router,
  Switch,
  Firewall,
  Host,
  Dash,
  Colon,
  QuotedString,
  NewLine,
  Semicolon,
};

export const netAllTokens: TokenType[] = order;
