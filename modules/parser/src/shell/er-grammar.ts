import { CstParser } from "chevrotain";
import { ErTok, erAllTokens } from "./er-tokens.js";

// Subset of Mermaid `erDiagram`: relationship lines `A <card><line><card> B [: label]`, bare entity
// declarations `A`, and entity attribute blocks `A { type name PK,FK "comment" … }`.
class ErParser extends CstParser {
  constructor() {
    super(erAllTokens);
    this.performSelfAnalysis();
  }

  readonly er = this.RULE("er", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(ErTok.ErDiagram);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.styleDirective) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  // A whole-line Mermaid styling directive (`style`/`classDef`/`class`/`linkStyle`); distinct first
  // tokens keep the enclosing OR LL(1).
  private readonly styleDirective = this.RULE("erStyleDirective", () =>
    this.OR([
      { ALT: () => this.CONSUME(ErTok.StyleStmt) },
      { ALT: () => this.CONSUME(ErTok.ClassDefStmt) },
      { ALT: () => this.CONSUME(ErTok.ClassStmt) },
      { ALT: () => this.CONSUME(ErTok.LinkStyleStmt) },
    ]),
  );

  private readonly sep = this.RULE("erSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(ErTok.NewLine) },
      { ALT: () => this.CONSUME(ErTok.Semicolon) },
      { ALT: () => this.CONSUME(ErTok.LabelEnd) },
    ]),
  );

  // `A` (bare entity), `A <rel> B [: label]` (relationship), or `A { … }` (attribute block).
  private readonly statement = this.RULE("erStatement", () => {
    this.SUBRULE(this.entity);
    this.OPTION(() =>
      this.OR([
        {
          ALT: () => {
            this.CONSUME(ErTok.Relationship);
            this.SUBRULE2(this.entity);
            this.OPTION2(() => {
              this.CONSUME(ErTok.Colon);
              this.CONSUME(ErTok.LabelText);
            });
          },
        },
        { ALT: () => this.SUBRULE(this.block) },
      ]),
    );
  });

  // `{ <newlines> (attribute <newlines>)* }` — attribute rows separated by line breaks.
  private readonly block = this.RULE("erBlock", () => {
    this.CONSUME(ErTok.LBrace);
    this.MANY(() =>
      this.OR([
        { ALT: () => this.CONSUME(ErTok.NewLine) },
        { ALT: () => this.CONSUME(ErTok.Semicolon) },
        { ALT: () => this.SUBRULE(this.attribute) },
      ]),
    );
    this.CONSUME(ErTok.RBrace);
  });

  // `type name [key…] ["comment"]` — keys (PK/FK/UK) and the comment are classified in the AST step.
  private readonly attribute = this.RULE("erAttribute", () => {
    this.CONSUME(ErTok.Identifier);
    this.CONSUME2(ErTok.Identifier);
    this.MANY(() => this.CONSUME3(ErTok.Identifier));
    this.OPTION(() => this.CONSUME(ErTok.QuotedString));
  });

  private readonly entity = this.RULE("erEntity", () =>
    this.OR([
      { ALT: () => this.CONSUME(ErTok.Identifier) },
      { ALT: () => this.CONSUME(ErTok.QuotedString) },
    ]),
  );
}

export const erParser = new ErParser();
