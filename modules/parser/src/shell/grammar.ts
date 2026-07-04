import { CstParser } from "chevrotain";
import { allTokens, Tok } from "./tokens.js";

// A statement is a chain `nodeRef (link nodeRef)*`; a lone nodeRef is a node declaration.
class FlowchartParser extends CstParser {
  constructor() {
    // Offset tracking lets the AST builder process statements and subgraph blocks in source order,
    // so a node declared inside a subgraph is claimed by it even if a later top-level edge mentions it.
    super(allTokens, { nodeLocationTracking: "onlyOffset" });
    this.performSelfAnalysis();
  }

  readonly flowchart = this.RULE("flowchart", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.SUBRULE(this.header);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.subgraphBlock) },
        { ALT: () => this.SUBRULE(this.styleDirective) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  // `subgraph Id [title]` … statements/nested subgraphs … `end`. Distinct first tokens (Subgraph /
  // Identifier / separator) keep the body's OR LL(1).
  private readonly subgraphBlock = this.RULE("subgraphBlock", () => {
    this.CONSUME(Tok.Subgraph);
    this.CONSUME(Tok.Identifier);
    this.OPTION(() => this.SUBRULE(this.shape));
    this.MANY(() =>
      this.OR([
        { ALT: () => this.SUBRULE(this.sep) },
        { ALT: () => this.SUBRULE(this.subgraphBlock) },
        { ALT: () => this.SUBRULE(this.styleDirective) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
    this.CONSUME(Tok.End);
  });

  // A whole-line Mermaid styling directive (`style`/`classDef`/`class`/`linkStyle`). Each is a single
  // captured token; the AST builder parses its text. Distinct first tokens keep the enclosing OR LL(1).
  private readonly styleDirective = this.RULE("styleDirective", () =>
    this.OR([
      { ALT: () => this.CONSUME(Tok.StyleStmt) },
      { ALT: () => this.CONSUME(Tok.ClassDefStmt) },
      { ALT: () => this.CONSUME(Tok.ClassStmt) },
      { ALT: () => this.CONSUME(Tok.LinkStyleStmt) },
    ]),
  );

  private readonly header = this.RULE("header", () => {
    this.CONSUME(Tok.Graph);
    this.OPTION(() => this.CONSUME(Tok.Identifier));
  });

  private readonly sep = this.RULE("sep", () =>
    this.OR([{ ALT: () => this.CONSUME(Tok.NewLine) }, { ALT: () => this.CONSUME(Tok.Semicolon) }]),
  );

  private readonly statement = this.RULE("statement", () => {
    this.SUBRULE(this.nodeRef);
    this.MANY(() => {
      this.SUBRULE(this.link);
      this.SUBRULE2(this.nodeRef);
    });
  });

  private readonly nodeRef = this.RULE("nodeRef", () => {
    this.CONSUME(Tok.Identifier);
    this.OPTION(() => this.SUBRULE(this.shape));
    // Optional glyph: `id[label] icon "<pack>/<name>"`.
    this.OPTION2(() => {
      this.CONSUME(Tok.Icon);
      this.CONSUME(Tok.QuotedString);
    });
    // Optional inline class assignment: `id:::className` (Mermaid shorthand for `class id className`).
    this.OPTION3(() => this.CONSUME(Tok.ClassShorthand));
  });

  private readonly shape = this.RULE("shape", () =>
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Tok.LSquare);
          this.CONSUME(Tok.SquareText);
          this.CONSUME(Tok.RSquare);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Tok.LStadium);
          this.CONSUME(Tok.StadiumText);
          this.CONSUME(Tok.RStadium);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Tok.LCircle);
          this.CONSUME(Tok.CircleText);
          this.CONSUME(Tok.RCircle);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Tok.LParen);
          this.CONSUME(Tok.ParenText);
          this.CONSUME(Tok.RParen);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Tok.LCurly);
          this.CONSUME(Tok.CurlyText);
          this.CONSUME(Tok.RCurly);
        },
      },
    ]),
  );

  private readonly link = this.RULE("link", () => {
    this.OR([
      { ALT: () => this.CONSUME(Tok.Arrow) },
      { ALT: () => this.CONSUME(Tok.OpenLink) },
      { ALT: () => this.CONSUME(Tok.DottedArrow) },
      { ALT: () => this.CONSUME(Tok.ThickArrow) },
    ]);
    this.OPTION(() => {
      this.CONSUME(Tok.Pipe);
      this.CONSUME(Tok.PipeText);
      this.CONSUME(Tok.PipeEnd);
    });
  });
}

export const flowchartParser = new FlowchartParser();
