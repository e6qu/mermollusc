import { CstParser } from "chevrotain";
import { CloudTok, cloudAllTokens } from "./cloud-tokens.js";

// Cloud subset: nestable `group "label" { … }`, kind-typed service leaves (`compute web "Web"`),
// and undirected links (`a -- b : "label"`). A group starts with `group`, a leaf with a kind
// keyword, a link with an identifier — all distinct first tokens.
class CloudParser extends CstParser {
  constructor() {
    super(cloudAllTokens);
    this.performSelfAnalysis();
  }

  readonly cloud = this.RULE("cloud", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(CloudTok.CloudHeader);
    this.MANY2(() =>
      this.OR([{ ALT: () => this.SUBRULE2(this.sep) }, { ALT: () => this.SUBRULE(this.item) }]),
    );
  });

  private readonly sep = this.RULE("cloudSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(CloudTok.NewLine) },
      { ALT: () => this.CONSUME(CloudTok.Semicolon) },
    ]),
  );

  private readonly item = this.RULE("item", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.group) },
      { ALT: () => this.SUBRULE(this.leaf) },
      { ALT: () => this.SUBRULE(this.link) },
    ]),
  );

  private readonly group = this.RULE("group", () => {
    this.CONSUME(CloudTok.Group);
    this.CONSUME(CloudTok.QuotedString);
    this.CONSUME(CloudTok.LBrace);
    this.MANY(() =>
      this.OR([{ ALT: () => this.SUBRULE(this.sep) }, { ALT: () => this.SUBRULE(this.item) }]),
    );
    this.CONSUME(CloudTok.RBrace);
  });

  private readonly leaf = this.RULE("leaf", () => {
    this.SUBRULE(this.kind);
    this.CONSUME(CloudTok.Identifier);
    this.OPTION(() => this.CONSUME(CloudTok.QuotedString));
    this.OPTION2(() => {
      this.CONSUME(CloudTok.Icon);
      this.CONSUME2(CloudTok.QuotedString);
    });
  });

  private readonly kind = this.RULE("kind", () =>
    this.OR([
      { ALT: () => this.CONSUME(CloudTok.Compute) },
      { ALT: () => this.CONSUME(CloudTok.Storage) },
      { ALT: () => this.CONSUME(CloudTok.Database) },
      { ALT: () => this.CONSUME(CloudTok.Queue) },
      { ALT: () => this.CONSUME(CloudTok.Cdn) },
    ]),
  );

  private readonly link = this.RULE("link", () => {
    this.CONSUME(CloudTok.Identifier);
    this.OR([
      { ALT: () => this.CONSUME(CloudTok.Arrow) },
      { ALT: () => this.CONSUME(CloudTok.Dash) },
    ]);
    this.CONSUME2(CloudTok.Identifier);
    this.OPTION(() => {
      this.CONSUME(CloudTok.Colon);
      this.CONSUME(CloudTok.QuotedString);
    });
  });
}

export const cloudParser = new CloudParser();
