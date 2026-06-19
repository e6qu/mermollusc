import { CstParser } from "chevrotain";
import { StateTok, stateAllTokens } from "./state-tokens.js";

// Subset of Mermaid `stateDiagram-v2`: transitions `A --> B [: label]` (endpoints are identifiers or
// the `[*]` start/end pseudo-state), state descriptions `A : label`, and `state "Label" as A`.
class StateParser extends CstParser {
  constructor() {
    super(stateAllTokens);
    this.performSelfAnalysis();
  }

  readonly state = this.RULE("state", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(StateTok.StateDiagram);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("stateSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(StateTok.NewLine) },
      { ALT: () => this.CONSUME(StateTok.Semicolon) },
      { ALT: () => this.CONSUME(StateTok.LabelEnd) },
    ]),
  );

  private readonly statement = this.RULE("stateStatement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.stateDecl) },
      { ALT: () => this.SUBRULE(this.noteStmt) },
      { ALT: () => this.SUBRULE(this.line) },
    ]),
  );

  // `note right of X : text` / `note left of X : text` / `note over X : text`
  private readonly noteStmt = this.RULE("noteStmt", () => {
    this.CONSUME(StateTok.Note);
    this.OR([
      { ALT: () => this.CONSUME(StateTok.RightOf) },
      { ALT: () => this.CONSUME(StateTok.LeftOf) },
      { ALT: () => this.CONSUME(StateTok.Over) },
    ]);
    this.CONSUME(StateTok.Identifier);
    this.CONSUME(StateTok.Colon);
    this.CONSUME(StateTok.LabelText);
  });

  // `state id`, `state "Long label" as id`, optionally a `{ … }` composite block on either.
  private readonly stateDecl = this.RULE("stateDecl", () => {
    this.CONSUME(StateTok.StateKw);
    this.OR([
      {
        ALT: () => {
          this.CONSUME(StateTok.QuotedString);
          this.CONSUME(StateTok.As);
          this.CONSUME(StateTok.Identifier);
        },
      },
      { ALT: () => this.CONSUME2(StateTok.Identifier) },
    ]);
    this.OPTION(() => this.CONSUME(StateTok.Annotation));
    this.OPTION2(() => this.SUBRULE(this.block));
  });

  private readonly block = this.RULE("stateBlock", () => {
    this.CONSUME(StateTok.LBrace);
    this.MANY(() =>
      this.OR([{ ALT: () => this.SUBRULE(this.sep) }, { ALT: () => this.SUBRULE(this.statement) }]),
    );
    this.CONSUME(StateTok.RBrace);
  });

  // `endpoint --> endpoint [: label]` or `endpoint : label`
  private readonly line = this.RULE("stateLine", () => {
    this.SUBRULE(this.endpoint);
    this.OR([
      {
        ALT: () => {
          this.CONSUME(StateTok.Arrow);
          this.SUBRULE2(this.endpoint);
          this.OPTION(() => {
            this.CONSUME(StateTok.Colon);
            this.CONSUME(StateTok.LabelText);
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME2(StateTok.Colon);
          this.CONSUME2(StateTok.LabelText);
        },
      },
    ]);
  });

  private readonly endpoint = this.RULE("stateEndpoint", () =>
    this.OR([
      { ALT: () => this.CONSUME(StateTok.Identifier) },
      { ALT: () => this.CONSUME(StateTok.Star) },
    ]),
  );
}

export const stateParser = new StateParser();
