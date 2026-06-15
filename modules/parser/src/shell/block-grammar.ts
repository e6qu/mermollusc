import { CstParser } from "chevrotain";
import { BlockTok, blockAllTokens } from "./block-tokens.js";

// `block-beta` subset: a `columns N` directive plus block declarations and edge chains that reuse
// the flowchart shape/link syntax. A lone nodeRef declares a block; a chain declares edges.
class BlockParser extends CstParser {
  constructor() {
    super(blockAllTokens);
    this.performSelfAnalysis();
  }

  readonly block = this.RULE("block", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(BlockTok.BlockHeader);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("blockSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(BlockTok.NewLine) },
      { ALT: () => this.CONSUME(BlockTok.Semicolon) },
    ]),
  );

  private readonly statement = this.RULE("statement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.columnsDecl) },
      { ALT: () => this.SUBRULE(this.chain) },
    ]),
  );

  private readonly columnsDecl = this.RULE("columnsDecl", () => {
    this.CONSUME(BlockTok.Columns);
    this.CONSUME(BlockTok.Number);
  });

  private readonly chain = this.RULE("chain", () => {
    this.SUBRULE(this.nodeRef);
    this.MANY(() => {
      this.SUBRULE(this.link);
      this.SUBRULE2(this.nodeRef);
    });
  });

  private readonly nodeRef = this.RULE("nodeRef", () => {
    this.CONSUME(BlockTok.Identifier);
    this.OPTION(() => this.SUBRULE(this.shape));
    this.OPTION2(() => {
      this.CONSUME(BlockTok.Icon);
      this.CONSUME(BlockTok.Quoted);
    });
  });

  private readonly shape = this.RULE("shape", () =>
    this.OR([
      {
        ALT: () => {
          this.CONSUME(BlockTok.LSquare);
          this.CONSUME(BlockTok.SquareText);
          this.CONSUME(BlockTok.RSquare);
        },
      },
      {
        ALT: () => {
          this.CONSUME(BlockTok.LParen);
          this.CONSUME(BlockTok.ParenText);
          this.CONSUME(BlockTok.RParen);
        },
      },
      {
        ALT: () => {
          this.CONSUME(BlockTok.LCurly);
          this.CONSUME(BlockTok.CurlyText);
          this.CONSUME(BlockTok.RCurly);
        },
      },
    ]),
  );

  private readonly link = this.RULE("link", () => {
    this.OR([
      { ALT: () => this.CONSUME(BlockTok.Arrow) },
      { ALT: () => this.CONSUME(BlockTok.OpenLink) },
      { ALT: () => this.CONSUME(BlockTok.DottedArrow) },
      { ALT: () => this.CONSUME(BlockTok.ThickArrow) },
    ]);
    this.OPTION(() => {
      this.CONSUME(BlockTok.Pipe);
      this.CONSUME(BlockTok.PipeText);
      this.CONSUME(BlockTok.PipeEnd);
    });
  });
}

export const blockParser = new BlockParser();
