import { CstParser } from "chevrotain";
import { SeqTok, seqAllTokens } from "./seq-tokens.js";

// `participant X [as Label]` declarations and `A ->> B : text` messages; actors not declared
// explicitly are inferred from message endpoints.
class SequenceParser extends CstParser {
  constructor() {
    super(seqAllTokens);
    this.performSelfAnalysis();
  }

  readonly sequence = this.RULE("sequence", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(SeqTok.SequenceDiagram);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("seqSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(SeqTok.NewLine) },
      { ALT: () => this.CONSUME(SeqTok.Semicolon) },
      { ALT: () => this.CONSUME(SeqTok.MsgEnd) },
    ]),
  );

  private readonly statement = this.RULE("seqStatement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.participantDecl) },
      { ALT: () => this.SUBRULE(this.note) },
      { ALT: () => this.SUBRULE(this.message) },
    ]),
  );

  // `note over A[,B] : text` / `note left of A : text` / `note right of A : text`. The `:` enters the
  // shared message lexer mode, so the note text is captured as `MsgText` like a message's.
  private readonly note = this.RULE("note", () => {
    this.CONSUME(SeqTok.Note);
    this.OR([
      { ALT: () => this.CONSUME(SeqTok.Over) },
      {
        ALT: () => {
          this.OR2([
            { ALT: () => this.CONSUME(SeqTok.Left) },
            { ALT: () => this.CONSUME(SeqTok.Right) },
          ]);
          this.CONSUME(SeqTok.Of);
        },
      },
    ]);
    this.CONSUME(SeqTok.Identifier);
    this.MANY(() => {
      this.CONSUME(SeqTok.Comma);
      this.CONSUME2(SeqTok.Identifier);
    });
    this.CONSUME(SeqTok.Colon);
    this.CONSUME(SeqTok.MsgText);
  });

  private readonly participantDecl = this.RULE("participantDecl", () => {
    this.CONSUME(SeqTok.Participant);
    this.CONSUME(SeqTok.Identifier);
    this.OPTION(() => {
      this.CONSUME(SeqTok.As);
      this.CONSUME2(SeqTok.Identifier);
    });
  });

  private readonly message = this.RULE("message", () => {
    this.CONSUME(SeqTok.Identifier);
    this.SUBRULE(this.arrow);
    this.CONSUME2(SeqTok.Identifier);
    this.CONSUME(SeqTok.Colon);
    this.CONSUME(SeqTok.MsgText);
  });

  private readonly arrow = this.RULE("arrow", () =>
    this.OR([
      { ALT: () => this.CONSUME(SeqTok.SolidArrow) },
      { ALT: () => this.CONSUME(SeqTok.DashedArrow) },
      { ALT: () => this.CONSUME(SeqTok.SolidOpen) },
      { ALT: () => this.CONSUME(SeqTok.DashedOpen) },
    ]),
  );
}

export const sequenceParser = new SequenceParser();
