import { CstParser } from "chevrotain";
import { GitTok, gitAllTokens } from "./git-tokens.js";

// gitGraph subset: an optional `LR:`/`TB:`/`BT:` direction after the header, then a sequence of
// commands. `commit`/`merge` carry optional `id:`/`tag:`/`type:` attributes in any order; `branch`/
// `checkout`/`switch` name a branch (a bare identifier or a quoted string).
class GitGraphParser extends CstParser {
  constructor() {
    super(gitAllTokens);
    this.performSelfAnalysis();
  }

  readonly gitGraph = this.RULE("gitGraph", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(GitTok.GitGraphHeader);
    this.OPTION(() => {
      this.SUBRULE(this.direction);
      this.CONSUME(GitTok.Colon);
    });
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("gitSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(GitTok.NewLine) },
      { ALT: () => this.CONSUME(GitTok.Semicolon) },
    ]),
  );

  private readonly direction = this.RULE("direction", () =>
    this.OR([
      { ALT: () => this.CONSUME(GitTok.DirLR) },
      { ALT: () => this.CONSUME(GitTok.DirTB) },
      { ALT: () => this.CONSUME(GitTok.DirBT) },
    ]),
  );

  private readonly statement = this.RULE("statement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.commitStmt) },
      { ALT: () => this.SUBRULE(this.branchStmt) },
      { ALT: () => this.SUBRULE(this.checkoutStmt) },
      { ALT: () => this.SUBRULE(this.mergeStmt) },
    ]),
  );

  private readonly commitStmt = this.RULE("commitStmt", () => {
    this.CONSUME(GitTok.Commit);
    this.MANY(() => this.SUBRULE(this.commitOpt));
  });

  private readonly mergeStmt = this.RULE("mergeStmt", () => {
    this.CONSUME(GitTok.Merge);
    this.SUBRULE(this.branchName);
    this.MANY(() => this.SUBRULE(this.commitOpt));
  });

  private readonly commitOpt = this.RULE("commitOpt", () =>
    this.OR([
      {
        ALT: () => {
          this.CONSUME(GitTok.Id);
          this.CONSUME(GitTok.Colon);
          this.CONSUME(GitTok.QuotedString);
        },
      },
      {
        ALT: () => {
          this.CONSUME2(GitTok.Tag);
          this.CONSUME2(GitTok.Colon);
          this.CONSUME2(GitTok.QuotedString);
        },
      },
      {
        ALT: () => {
          this.CONSUME3(GitTok.Type);
          this.CONSUME3(GitTok.Colon);
          this.SUBRULE(this.commitTypeVal);
        },
      },
    ]),
  );

  private readonly commitTypeVal = this.RULE("commitTypeVal", () =>
    this.OR([
      { ALT: () => this.CONSUME(GitTok.Normal) },
      { ALT: () => this.CONSUME(GitTok.Reverse) },
      { ALT: () => this.CONSUME(GitTok.Highlight) },
    ]),
  );

  private readonly branchStmt = this.RULE("branchStmt", () => {
    this.CONSUME(GitTok.Branch);
    this.SUBRULE(this.branchName);
  });

  private readonly checkoutStmt = this.RULE("checkoutStmt", () => {
    this.OR([
      { ALT: () => this.CONSUME(GitTok.Checkout) },
      { ALT: () => this.CONSUME(GitTok.Switch) },
    ]);
    this.SUBRULE(this.branchName);
  });

  private readonly branchName = this.RULE("branchName", () =>
    this.OR([
      { ALT: () => this.CONSUME(GitTok.Identifier) },
      { ALT: () => this.CONSUME(GitTok.QuotedString) },
    ]),
  );
}

export const gitGraphParser = new GitGraphParser();
