import { createToken, Lexer, type TokenType } from "chevrotain";

// `requirementDiagram`: entity declarations (`requirement foo { … }` / `element bar { … }`) and
// relationship lines (`a - satisfies -> b`, or reversed `a <- satisfies - b`). Body `key: value`
// lines are captured whole in a dedicated mode (like the class member body), split in the AST step.
const Identifier = createToken({ name: "ReqIdentifier", pattern: /[A-Za-z_]\w*/ });
const RequirementDiagram = createToken({
  name: "RequirementDiagram",
  pattern: /requirementDiagram/,
  longer_alt: Identifier,
});
// The node-introducing keyword: a requirement type or `element`. Longest alternatives first so e.g.
// `functionalRequirement` isn't read as `requirement`.
const KindKw = createToken({
  name: "ReqKindKw",
  pattern:
    /functionalRequirement|performanceRequirement|interfaceRequirement|physicalRequirement|designConstraint|requirement|element/,
  longer_alt: Identifier,
});
const NewLine = createToken({ name: "ReqNewLine", pattern: /\r?\n/, line_breaks: true });
const Semicolon = createToken({ name: "ReqSemicolon", pattern: /;/ });
const WhiteSpace = createToken({ name: "ReqWhiteSpace", pattern: /[ \t]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: "ReqComment", pattern: /%%[^\n]*/, group: Lexer.SKIPPED });

// `->` / `<-` before the bare `-` so the longer operators win.
const Arrow = createToken({ name: "ReqArrow", pattern: /->/ });
const RevArrow = createToken({ name: "ReqRevArrow", pattern: /<-/ });
const Dash = createToken({ name: "ReqDash", pattern: /-/ });

const LBrace = createToken({ name: "ReqLBrace", pattern: /\{/, push_mode: "body" });
const RBrace = createToken({ name: "ReqRBrace", pattern: /\}/, pop_mode: true });
const BodyNewLine = createToken({ name: "ReqBodyNewLine", pattern: /\r?\n/, line_breaks: true });
const FieldText = createToken({ name: "ReqFieldText", pattern: /[^\n}]+/ });

export const reqLexer = new Lexer({
  modes: {
    main: [
      WhiteSpace,
      Comment,
      NewLine,
      Semicolon,
      RequirementDiagram,
      KindKw,
      Arrow,
      RevArrow,
      Dash,
      LBrace,
      Identifier,
    ],
    body: [RBrace, BodyNewLine, FieldText],
  },
  defaultMode: "main",
});

export const ReqTok = {
  Identifier,
  RequirementDiagram,
  KindKw,
  NewLine,
  Semicolon,
  Arrow,
  RevArrow,
  Dash,
  LBrace,
  RBrace,
  BodyNewLine,
  FieldText,
};

export const reqAllTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  Semicolon,
  RequirementDiagram,
  KindKw,
  Arrow,
  RevArrow,
  Dash,
  LBrace,
  RBrace,
  BodyNewLine,
  FieldText,
  Identifier,
];
