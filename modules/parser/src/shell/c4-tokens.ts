import { createToken, Lexer, type TokenType } from "chevrotain";

const Identifier = createToken({ name: "C4Identifier", pattern: /[A-Za-z0-9_]+/ });
const C4Header = createToken({
  name: "C4Header",
  pattern: /C4Context|C4Container|C4Component/,
  longer_alt: Identifier,
});
const Person = createToken({ name: "Person", pattern: /Person/, longer_alt: Identifier });
const System = createToken({ name: "System", pattern: /System/, longer_alt: Identifier });
const Container = createToken({ name: "Container", pattern: /Container/, longer_alt: Identifier });
const Boundary = createToken({ name: "Boundary", pattern: /Boundary/, longer_alt: Identifier });
const Rel = createToken({ name: "Rel", pattern: /Rel/, longer_alt: Identifier });
const QuotedString = createToken({ name: "QuotedString", pattern: /"[^"]*"/ });
const LParen = createToken({ name: "C4LParen", pattern: /\(/ });
const RParen = createToken({ name: "C4RParen", pattern: /\)/ });
const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const NewLine = createToken({ name: "C4NewLine", pattern: /\r?\n/, line_breaks: true });
const WhiteSpace = createToken({ name: "C4WhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "C4Comment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

export const c4Lexer = new Lexer([
  WhiteSpace,
  Comment,
  NewLine,
  C4Header,
  Person,
  System,
  Container,
  Boundary,
  Rel,
  QuotedString,
  LParen,
  RParen,
  LBrace,
  RBrace,
  Comma,
  Identifier,
]);

export const C4Tok = {
  Identifier,
  C4Header,
  Person,
  System,
  Container,
  Boundary,
  Rel,
  QuotedString,
  LParen,
  RParen,
  LBrace,
  RBrace,
  Comma,
  NewLine,
};

export const c4AllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  C4Header,
  Person,
  System,
  Container,
  Boundary,
  Rel,
  QuotedString,
  LParen,
  RParen,
  LBrace,
  RBrace,
  Comma,
  Identifier,
];
