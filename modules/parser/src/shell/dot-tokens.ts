import { createToken, Lexer, type TokenType } from "chevrotain";

// Graphviz DOT lexer. DOT is free-form (newlines aren't significant), so all whitespace and the three
// comment forms are skipped. Keywords are case-insensitive and ordered before `Id` with a `longer_alt`
// so an identifier that merely starts with one (e.g. `graphs`) stays an identifier.
const LineComment = createToken({
  name: "LineComment",
  pattern: /\/\/[^\n]*/,
  group: Lexer.SKIPPED,
});
const HashComment = createToken({ name: "HashComment", pattern: /#[^\n]*/, group: Lexer.SKIPPED });
const BlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
  line_breaks: true,
});
const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
  line_breaks: true,
});

const Id = createToken({ name: "Id", pattern: /[A-Za-z_][A-Za-z0-9_]*/ });
const Strict = createToken({ name: "Strict", pattern: /strict/i, longer_alt: Id });
const Digraph = createToken({ name: "Digraph", pattern: /digraph/i, longer_alt: Id });
const Graph = createToken({ name: "Graph", pattern: /graph/i, longer_alt: Id });
const NodeKw = createToken({ name: "NodeKw", pattern: /node/i, longer_alt: Id });
const EdgeKw = createToken({ name: "EdgeKw", pattern: /edge/i, longer_alt: Id });
const Subgraph = createToken({ name: "Subgraph", pattern: /subgraph/i, longer_alt: Id });

// A double-quoted string with backslash escapes (DOT allows escaped quotes inside).
const QuotedString = createToken({ name: "QuotedString", pattern: /"(?:\\.|[^"\\])*"/ });
const NumberLit = createToken({ name: "NumberLit", pattern: /-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)/ });

const Arrow = createToken({ name: "Arrow", pattern: /->/ });
const DashDash = createToken({ name: "DashDash", pattern: /--/ });
const Eq = createToken({ name: "Eq", pattern: /=/ });
const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
const RBracket = createToken({ name: "RBracket", pattern: /\]/ });
const Semi = createToken({ name: "Semi", pattern: /;/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });

const order: TokenType[] = [
  WhiteSpace,
  LineComment,
  HashComment,
  BlockComment,
  Strict,
  Digraph,
  Graph,
  NodeKw,
  EdgeKw,
  Subgraph,
  Arrow,
  DashDash,
  Eq,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  Semi,
  Comma,
  QuotedString,
  NumberLit,
  Id,
];

export const dotLexer = new Lexer(order);

export const DotTok = {
  Strict,
  Digraph,
  Graph,
  NodeKw,
  EdgeKw,
  Subgraph,
  Id,
  QuotedString,
  NumberLit,
  Arrow,
  DashDash,
  Eq,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  Semi,
  Comma,
};

export const dotAllTokens: TokenType[] = order;
