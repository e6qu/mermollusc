import { CstParser } from "chevrotain";
import { C4Tok, c4AllTokens } from "./c4-tokens.js";

// Subset of Mermaid C4: typed elements `Person/System/Container(id, "label"[, "description"])`,
// nestable `Boundary(id, "label") { ... }`, and `Rel(from, to, "label")`.
class C4Parser extends CstParser {
  constructor() {
    super(c4AllTokens);
    this.performSelfAnalysis();
  }

  readonly c4 = this.RULE("c4", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(C4Tok.C4Header);
    this.MANY2(() =>
      this.OR([{ ALT: () => this.SUBRULE2(this.sep) }, { ALT: () => this.SUBRULE(this.item) }]),
    );
  });

  private readonly sep = this.RULE("c4Sep", () => this.CONSUME(C4Tok.NewLine));

  private readonly item = this.RULE("item", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.element) },
      { ALT: () => this.SUBRULE(this.boundary) },
      { ALT: () => this.SUBRULE(this.updateElementStyle) },
      { ALT: () => this.SUBRULE(this.updateRelStyle) },
      { ALT: () => this.SUBRULE(this.rel) },
    ]),
  );

  // A `$name="value"` styling argument, e.g. `$bgColor="#1168bd"`.
  private readonly styleArg = this.RULE("c4StyleArg", () => {
    this.CONSUME(C4Tok.Comma);
    this.CONSUME(C4Tok.StyleArg);
    this.CONSUME(C4Tok.Equals);
    this.CONSUME(C4Tok.QuotedString);
  });

  // `UpdateElementStyle(id, $bgColor="…", $borderColor="…", …)`.
  private readonly updateElementStyle = this.RULE("updateElementStyle", () => {
    this.CONSUME(C4Tok.UpdateElementStyle);
    this.CONSUME(C4Tok.LParen);
    this.CONSUME(C4Tok.Identifier);
    this.MANY(() => this.SUBRULE(this.styleArg));
    this.CONSUME(C4Tok.RParen);
  });

  // `UpdateRelStyle(from, to, $lineColor="…", …)`.
  private readonly updateRelStyle = this.RULE("updateRelStyle", () => {
    this.CONSUME(C4Tok.UpdateRelStyle);
    this.CONSUME(C4Tok.LParen);
    this.CONSUME(C4Tok.Identifier);
    this.CONSUME(C4Tok.Comma);
    this.CONSUME2(C4Tok.Identifier);
    this.MANY(() => this.SUBRULE(this.styleArg));
    this.CONSUME(C4Tok.RParen);
  });

  private readonly element = this.RULE("element", () => {
    this.OR([
      { ALT: () => this.CONSUME(C4Tok.Person) },
      { ALT: () => this.CONSUME(C4Tok.System) },
      { ALT: () => this.CONSUME(C4Tok.Container) },
    ]);
    this.CONSUME(C4Tok.LParen);
    this.CONSUME(C4Tok.Identifier);
    this.CONSUME(C4Tok.Comma);
    this.CONSUME(C4Tok.QuotedString);
    // Mermaid allows an optional description after the label.
    this.OPTION(() => {
      this.CONSUME2(C4Tok.Comma);
      this.CONSUME2(C4Tok.QuotedString);
    });
    this.CONSUME(C4Tok.RParen);
  });

  private readonly boundary = this.RULE("boundary", () => {
    this.CONSUME(C4Tok.Boundary);
    this.CONSUME(C4Tok.LParen);
    this.CONSUME(C4Tok.Identifier);
    this.CONSUME(C4Tok.Comma);
    this.CONSUME(C4Tok.QuotedString);
    this.CONSUME(C4Tok.RParen);
    this.CONSUME(C4Tok.LBrace);
    this.MANY(() =>
      this.OR([{ ALT: () => this.SUBRULE(this.sep) }, { ALT: () => this.SUBRULE(this.item) }]),
    );
    this.CONSUME(C4Tok.RBrace);
  });

  private readonly rel = this.RULE("rel", () => {
    this.CONSUME(C4Tok.Rel);
    this.CONSUME(C4Tok.LParen);
    this.CONSUME(C4Tok.Identifier);
    this.CONSUME(C4Tok.Comma);
    this.CONSUME2(C4Tok.Identifier);
    this.CONSUME2(C4Tok.Comma);
    this.CONSUME(C4Tok.QuotedString);
    this.CONSUME(C4Tok.RParen);
  });
}

export const c4Parser = new C4Parser();
