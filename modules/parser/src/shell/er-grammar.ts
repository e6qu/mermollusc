import { CstParser } from "chevrotain";
import { ErTok, erAllTokens } from "./er-tokens.js";

// Subset of Mermaid `erDiagram`: relationship lines `A <card><line><card> B [: label]` and bare
// entity declarations `A`. Entity attribute blocks (`A { … }`) are future work.
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
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("erSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(ErTok.NewLine) },
      { ALT: () => this.CONSUME(ErTok.Semicolon) },
      { ALT: () => this.CONSUME(ErTok.LabelEnd) },
    ]),
  );

  // `A` (bare entity) or `A <rel> B [: label]` (relationship).
  private readonly statement = this.RULE("erStatement", () => {
    this.SUBRULE(this.entity);
    this.OPTION(() => {
      this.CONSUME(ErTok.Relationship);
      this.SUBRULE2(this.entity);
      this.OPTION2(() => {
        this.CONSUME(ErTok.Colon);
        this.CONSUME(ErTok.LabelText);
      });
    });
  });

  private readonly entity = this.RULE("erEntity", () =>
    this.OR([
      { ALT: () => this.CONSUME(ErTok.Identifier) },
      { ALT: () => this.CONSUME(ErTok.QuotedString) },
    ]),
  );
}

export const erParser = new ErParser();
