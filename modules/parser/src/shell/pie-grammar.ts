import { CstParser } from "chevrotain";
import { PieTok, pieAllTokens } from "./pie-tokens.js";

// Pie subset: `pie [showData] [donut]`, an optional `title`, and `"label" : value` data rows in any
// order after the header.
class PieParser extends CstParser {
  constructor() {
    super(pieAllTokens);
    this.performSelfAnalysis();
  }

  readonly pie = this.RULE("pie", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(PieTok.Pie);
    this.MANY2(() =>
      this.OR1([
        { ALT: () => this.CONSUME(PieTok.ShowData) },
        { ALT: () => this.CONSUME(PieTok.Donut) },
      ]),
    );
    this.MANY3(() =>
      this.OR2([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.titleLine) },
        { ALT: () => this.SUBRULE(this.row) },
      ]),
    );
  });

  private readonly sep = this.RULE("pieSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(PieTok.NewLine) },
      { ALT: () => this.CONSUME(PieTok.TitleNewLine) },
    ]),
  );

  private readonly titleLine = this.RULE("titleLine", () => {
    this.CONSUME(PieTok.Title);
    this.OPTION(() => this.CONSUME(PieTok.TitleText));
  });

  private readonly row = this.RULE("row", () => {
    this.CONSUME(PieTok.QuotedString);
    this.CONSUME(PieTok.Colon);
    this.CONSUME(PieTok.NumberLit);
  });
}

export const pieParser = new PieParser();
