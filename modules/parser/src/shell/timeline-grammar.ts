import { CstParser } from "chevrotain";
import { TlTok, timelineAllTokens } from "./timeline-tokens.js";

// Timeline subset: a `title`, `section` groupings, and period lines (`period : event : event`). Events
// also attach via continuation lines that start with `:`. `title`/`section` swallow the rest of their
// line (colons and all) since their value is read from the source text, not reconstructed from tokens.
class TimelineParser extends CstParser {
  constructor() {
    super(timelineAllTokens);
    this.performSelfAnalysis();
  }

  readonly timeline = this.RULE("timeline", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(TlTok.Timeline);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("timelineSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(TlTok.StartNewLine) },
      { ALT: () => this.CONSUME(TlTok.BodyNewLine) },
    ]),
  );

  private readonly statement = this.RULE("statement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.titleLine) },
      { ALT: () => this.SUBRULE(this.sectionLine) },
      { ALT: () => this.SUBRULE(this.periodLine) },
      { ALT: () => this.SUBRULE(this.continuationLine) },
    ]),
  );

  private readonly titleLine = this.RULE("titleLine", () => {
    this.CONSUME(TlTok.Title);
    this.MANY(() =>
      this.OR([
        { ALT: () => this.CONSUME(TlTok.BodyText) },
        { ALT: () => this.CONSUME(TlTok.Colon) },
      ]),
    );
  });

  private readonly sectionLine = this.RULE("sectionLine", () => {
    this.CONSUME(TlTok.Section);
    this.MANY(() =>
      this.OR([
        { ALT: () => this.CONSUME(TlTok.BodyText) },
        { ALT: () => this.CONSUME(TlTok.Colon) },
      ]),
    );
  });

  private readonly periodLine = this.RULE("periodLine", () => {
    this.CONSUME(TlTok.PeriodText);
    this.MANY(() => {
      this.CONSUME(TlTok.Colon);
      this.OPTION(() => this.CONSUME(TlTok.BodyText));
    });
  });

  private readonly continuationLine = this.RULE("continuationLine", () => {
    this.CONSUME(TlTok.LeadColon);
    this.OPTION(() => this.CONSUME(TlTok.BodyText));
    this.MANY(() => {
      this.CONSUME2(TlTok.Colon);
      this.OPTION2(() => this.CONSUME2(TlTok.BodyText));
    });
  });
}

export const timelineParser = new TimelineParser();
