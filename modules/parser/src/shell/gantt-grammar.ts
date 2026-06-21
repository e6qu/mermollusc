import { CstParser } from "chevrotain";
import { GtTok, ganttAllTokens } from "./gantt-tokens.js";

// Gantt subset: a `title`, a `dateFormat`, `section` groupings, and task lines
// (`label : [status,] [id,] start, duration`). The keyword lines swallow the rest of their line (their
// value is read from the source text, not reconstructed from tokens); a task line's meta is the
// comma-separated chunks after the `:`.
class GanttParser extends CstParser {
  constructor() {
    super(ganttAllTokens);
    this.performSelfAnalysis();
  }

  readonly gantt = this.RULE("gantt", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(GtTok.Gantt);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("ganttSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(GtTok.StartNewLine) },
      { ALT: () => this.CONSUME(GtTok.BodyNewLine) },
    ]),
  );

  private readonly statement = this.RULE("ganttStatement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.titleLine) },
      { ALT: () => this.SUBRULE(this.dateFormatLine) },
      { ALT: () => this.SUBRULE(this.sectionLine) },
      { ALT: () => this.SUBRULE(this.taskLine) },
    ]),
  );

  // The three keyword lines share a shape: keyword + the rest of the line (any body tokens).
  private readonly rest = this.RULE("ganttRest", () =>
    this.MANY(() =>
      this.OR([
        { ALT: () => this.CONSUME(GtTok.BodyText) },
        { ALT: () => this.CONSUME(GtTok.Colon) },
        { ALT: () => this.CONSUME(GtTok.Comma) },
      ]),
    ),
  );

  private readonly titleLine = this.RULE("titleLine", () => {
    this.CONSUME(GtTok.Title);
    this.SUBRULE(this.rest);
  });

  private readonly dateFormatLine = this.RULE("dateFormatLine", () => {
    this.CONSUME(GtTok.DateFormat);
    this.SUBRULE(this.rest);
  });

  private readonly sectionLine = this.RULE("sectionLine", () => {
    this.CONSUME(GtTok.Section);
    this.SUBRULE(this.rest);
  });

  private readonly taskLine = this.RULE("taskLine", () => {
    this.CONSUME(GtTok.TaskLabel);
    this.CONSUME(GtTok.Colon);
    this.MANY(() =>
      this.OR([
        { ALT: () => this.CONSUME(GtTok.BodyText) },
        { ALT: () => this.CONSUME(GtTok.Comma) },
      ]),
    );
  });
}

export const ganttParser = new GanttParser();
