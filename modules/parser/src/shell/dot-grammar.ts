import { CstParser } from "chevrotain";
import { DotTok, dotAllTokens } from "./dot-tokens.js";

// A DOT subset: `[strict] (graph|digraph) [id] { … }` with node statements, edge statements (incl.
// `a -> b -> c` chains), default `node`/`edge`/`graph` attr statements, `ID = ID` graph attributes, and
// nested `subgraph [id] { … }` / anonymous `{ … }` blocks. Ports and HTML labels are out of scope.
// After an id, the next token tells node from edge from graph-attribute: `=` → attribute, `->`/`--` →
// edge, `[`/nothing → node.
class DotParser extends CstParser {
  constructor() {
    super(dotAllTokens);
    this.performSelfAnalysis();
  }

  readonly dot = this.RULE("dot", () => {
    this.OPTION(() => this.CONSUME(DotTok.Strict));
    this.OR([
      { ALT: () => this.CONSUME(DotTok.Graph) },
      { ALT: () => this.CONSUME(DotTok.Digraph) },
    ]);
    this.OPTION2(() => this.SUBRULE(this.id));
    this.CONSUME(DotTok.LBrace);
    this.MANY(() => this.SUBRULE(this.stmt));
    this.CONSUME(DotTok.RBrace);
  });

  private readonly id = this.RULE("id", () =>
    this.OR([
      { ALT: () => this.CONSUME(DotTok.Id) },
      { ALT: () => this.CONSUME(DotTok.QuotedString) },
      { ALT: () => this.CONSUME(DotTok.NumberLit) },
    ]),
  );

  private readonly stmt = this.RULE("stmt", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.attrStmt) },
      { ALT: () => this.SUBRULE(this.subgraphStmt) },
      { ALT: () => this.SUBRULE(this.idStmt) },
    ]);
    this.OPTION(() => this.CONSUME(DotTok.Semi));
  });

  // `subgraph [id] { … }` or a bare anonymous `{ … }`. Recurses through `stmt`.
  private readonly subgraphStmt = this.RULE("subgraphStmt", () => {
    this.OPTION(() => {
      this.CONSUME(DotTok.Subgraph);
      this.OPTION2(() => this.SUBRULE(this.id));
    });
    this.CONSUME(DotTok.LBrace);
    this.MANY(() => this.SUBRULE(this.stmt));
    this.CONSUME(DotTok.RBrace);
  });

  private readonly attrStmt = this.RULE("attrStmt", () => {
    this.OR([
      { ALT: () => this.CONSUME(DotTok.Graph) },
      { ALT: () => this.CONSUME(DotTok.NodeKw) },
      { ALT: () => this.CONSUME(DotTok.EdgeKw) },
    ]);
    this.SUBRULE(this.attrList);
  });

  // A statement that starts with an id: a node, an edge chain, or an `id = id` graph attribute.
  private readonly idStmt = this.RULE("idStmt", () => {
    this.SUBRULE(this.id);
    this.OPTION(() =>
      this.OR([
        {
          ALT: () => {
            this.CONSUME(DotTok.Eq);
            this.SUBRULE2(this.id);
          },
        },
        { ALT: () => this.SUBRULE(this.edgeRHS) },
      ]),
    );
    this.OPTION2(() => this.SUBRULE(this.attrList));
  });

  private readonly edgeRHS = this.RULE("edgeRHS", () => {
    this.AT_LEAST_ONE(() => {
      this.OR([
        { ALT: () => this.CONSUME(DotTok.Arrow) },
        { ALT: () => this.CONSUME(DotTok.DashDash) },
      ]);
      this.SUBRULE(this.id);
    });
  });

  private readonly attrList = this.RULE("attrList", () => {
    this.AT_LEAST_ONE(() => {
      this.CONSUME(DotTok.LBracket);
      this.MANY(() => this.SUBRULE(this.aItem));
      this.CONSUME(DotTok.RBracket);
    });
  });

  private readonly aItem = this.RULE("aItem", () => {
    this.SUBRULE(this.id);
    this.CONSUME(DotTok.Eq);
    this.SUBRULE2(this.id);
    this.OPTION(() =>
      this.OR([
        { ALT: () => this.CONSUME(DotTok.Comma) },
        { ALT: () => this.CONSUME(DotTok.Semi) },
      ]),
    );
  });
}

export const dotParser = new DotParser();
