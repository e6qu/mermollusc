import { CstParser } from "chevrotain";
import { ReqTok, reqAllTokens } from "./req-tokens.js";

// Subset of Mermaid `requirementDiagram`: entity declarations `requirement foo { key: value … }` /
// `element bar { … }`, and relationship lines `a - verb -> b` (or reversed `a <- verb - b`).
class ReqParser extends CstParser {
  constructor() {
    super(reqAllTokens);
    this.performSelfAnalysis();
  }

  readonly requirementDiagram = this.RULE("requirementDiagram", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(ReqTok.RequirementDiagram);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("reqSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(ReqTok.NewLine) },
      { ALT: () => this.CONSUME(ReqTok.Semicolon) },
    ]),
  );

  private readonly statement = this.RULE("reqStatement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.entityDecl) },
      { ALT: () => this.SUBRULE(this.relationship) },
    ]),
  );

  // `requirement foo` / `element bar`, with an optional `{ key: value … }` body.
  private readonly entityDecl = this.RULE("reqEntityDecl", () => {
    this.CONSUME(ReqTok.KindKw);
    this.CONSUME(ReqTok.Identifier);
    this.OPTION(() => this.SUBRULE(this.body));
  });

  private readonly body = this.RULE("reqBody", () => {
    this.CONSUME(ReqTok.LBrace);
    this.MANY(() =>
      this.OR([
        { ALT: () => this.CONSUME(ReqTok.BodyNewLine) },
        { ALT: () => this.CONSUME(ReqTok.FieldText) },
      ]),
    );
    this.CONSUME(ReqTok.RBrace);
  });

  // `a - verb -> b` (a→b) or `a <- verb - b` (b→a). The three identifiers are src/dst + the verb.
  private readonly relationship = this.RULE("reqRelationship", () => {
    this.CONSUME(ReqTok.Identifier);
    this.OR([
      {
        ALT: () => {
          this.CONSUME(ReqTok.Dash);
          this.CONSUME2(ReqTok.Identifier);
          this.CONSUME(ReqTok.Arrow);
          this.CONSUME3(ReqTok.Identifier);
        },
      },
      {
        ALT: () => {
          this.CONSUME(ReqTok.RevArrow);
          this.CONSUME4(ReqTok.Identifier);
          this.CONSUME2(ReqTok.Dash);
          this.CONSUME5(ReqTok.Identifier);
        },
      },
    ]);
  });
}

export const reqParser = new ReqParser();
