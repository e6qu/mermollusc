import { CstParser } from "chevrotain";
import { MmTok, mindmapAllTokens } from "./mindmap-tokens.js";

// The grammar only collects the per-line `LineText` tokens after the header; the hierarchy lives in
// each token's `startColumn` (its indentation), which the CST→AST step reads to build the tree.
class MindmapParser extends CstParser {
  constructor() {
    super(mindmapAllTokens);
    this.performSelfAnalysis();
  }

  readonly mindmap = this.RULE("mindmap", () => {
    this.MANY(() => this.CONSUME(MmTok.NewLine));
    this.CONSUME(MmTok.Mindmap);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.CONSUME2(MmTok.NewLine) },
        { ALT: () => this.CONSUME(MmTok.LineText) },
      ]),
    );
  });
}

export const mindmapParser = new MindmapParser();
