import { CstParser } from "chevrotain";
import { NetTok, netAllTokens } from "./net-tokens.js";

// Network subset: kind-typed node declarations (`server web "Web"`) and undirected links
// (`a -- b : "label"`). A node decl starts with a kind keyword; a link starts with an identifier.
class NetworkParser extends CstParser {
  constructor() {
    super(netAllTokens);
    this.performSelfAnalysis();
  }

  readonly network = this.RULE("network", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(NetTok.NetworkHeader);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("netSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(NetTok.NewLine) },
      { ALT: () => this.CONSUME(NetTok.Semicolon) },
    ]),
  );

  private readonly statement = this.RULE("statement", () =>
    this.OR([{ ALT: () => this.SUBRULE(this.nodeDecl) }, { ALT: () => this.SUBRULE(this.link) }]),
  );

  private readonly nodeDecl = this.RULE("nodeDecl", () => {
    this.SUBRULE(this.kind);
    this.CONSUME(NetTok.Identifier);
    this.OPTION(() => this.CONSUME(NetTok.QuotedString));
  });

  private readonly kind = this.RULE("kind", () =>
    this.OR([
      { ALT: () => this.CONSUME(NetTok.Server) },
      { ALT: () => this.CONSUME(NetTok.Database) },
      { ALT: () => this.CONSUME(NetTok.Cloud) },
      { ALT: () => this.CONSUME(NetTok.Router) },
      { ALT: () => this.CONSUME(NetTok.Switch) },
      { ALT: () => this.CONSUME(NetTok.Firewall) },
      { ALT: () => this.CONSUME(NetTok.Host) },
    ]),
  );

  private readonly link = this.RULE("link", () => {
    this.CONSUME(NetTok.Identifier);
    this.CONSUME(NetTok.Dash);
    this.CONSUME2(NetTok.Identifier);
    this.OPTION(() => {
      this.CONSUME(NetTok.Colon);
      this.CONSUME(NetTok.QuotedString);
    });
  });
}

export const networkParser = new NetworkParser();
