import { CstParser } from "chevrotain";
import { ClassTok, classAllTokens } from "./class-tokens.js";

// Subset of Mermaid `classDiagram`: class declarations with an optional `{ … }` member body
// (`class Foo { +int id\n +area() double }`), the `Foo : +member` shorthand, and relationship lines
// `A <rel> B [: label]` whose operator encodes the UML arrowheads.
class ClassParser extends CstParser {
  constructor() {
    super(classAllTokens);
    this.performSelfAnalysis();
  }

  readonly classDiagram = this.RULE("classDiagram", () => {
    this.MANY(() => this.SUBRULE(this.sep));
    this.CONSUME(ClassTok.ClassDiagram);
    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE2(this.sep) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]),
    );
  });

  private readonly sep = this.RULE("classSep", () =>
    this.OR([
      { ALT: () => this.CONSUME(ClassTok.NewLine) },
      { ALT: () => this.CONSUME(ClassTok.Semicolon) },
      { ALT: () => this.CONSUME(ClassTok.LabelEnd) },
    ]),
  );

  private readonly statement = this.RULE("classStatement", () =>
    this.OR([
      { ALT: () => this.SUBRULE(this.classDecl) },
      { ALT: () => this.SUBRULE(this.styleDirective) },
      { ALT: () => this.SUBRULE(this.cssClassDecl) },
      { ALT: () => this.SUBRULE(this.relOrMember) },
      { ALT: () => this.SUBRULE(this.stereotypeDecl) },
    ]),
  );

  // Whole-line Mermaid styling directives. Class ASSIGNMENT is `cssClass`/`:::` (below), not a bare
  // `class A name` (which would collide with a declaration), so no `class` directive here.
  private readonly styleDirective = this.RULE("classStyleDirective", () =>
    this.OR([
      { ALT: () => this.CONSUME(ClassTok.StyleStmt) },
      { ALT: () => this.CONSUME(ClassTok.ClassDefStmt) },
      { ALT: () => this.CONSUME(ClassTok.LinkStyleStmt) },
    ]),
  );

  // `cssClass "A,B" styleName` — assigns the quoted comma-separated classes to a `classDef` style class.
  private readonly cssClassDecl = this.RULE("classCssClassDecl", () => {
    this.CONSUME(ClassTok.CssClass);
    this.CONSUME(ClassTok.QuotedString);
    this.CONSUME(ClassTok.Identifier);
  });

  // `class Foo` or `class Foo <<interface>>` or `class Foo <<interface>> { <members> }`, optionally with
  // an inline `:::styleName`.
  private readonly classDecl = this.RULE("classDecl", () => {
    this.CONSUME(ClassTok.ClassKw);
    this.CONSUME(ClassTok.Identifier);
    this.OPTION3(() => this.CONSUME(ClassTok.ClassShorthand));
    this.OPTION(() => this.CONSUME(ClassTok.Stereotype));
    this.OPTION2(() => this.SUBRULE(this.block));
  });

  private readonly stereotypeDecl = this.RULE("classStereotypeDecl", () => {
    this.CONSUME(ClassTok.Stereotype);
    this.CONSUME(ClassTok.Identifier);
  });

  private readonly block = this.RULE("classBlock", () => {
    this.CONSUME(ClassTok.LBrace);
    this.MANY(() =>
      this.OR([
        { ALT: () => this.CONSUME(ClassTok.BodyNewLine) },
        { ALT: () => this.CONSUME(ClassTok.MemberText) },
      ]),
    );
    this.CONSUME(ClassTok.RBrace);
  });

  // `Foo` (bare), `Foo : +member` (shorthand member), or `Foo <rel> Bar [: label]` (relationship).
  private readonly relOrMember = this.RULE("classRelOrMember", () => {
    this.CONSUME(ClassTok.Identifier);
    // Inline `Foo:::styleName` on the left endpoint / bare class reference.
    this.OPTION5(() => this.CONSUME(ClassTok.ClassShorthand));
    this.OPTION(() =>
      this.OR([
        {
          ALT: () => {
            // optional per-end multiplicity around the operator: `A "1" --> "*" B`
            this.OPTION2(() => this.CONSUME(ClassTok.QuotedString));
            this.CONSUME(ClassTok.Relationship);
            this.OPTION3(() => this.CONSUME2(ClassTok.QuotedString));
            this.CONSUME2(ClassTok.Identifier);
            this.OPTION6(() => this.CONSUME2(ClassTok.ClassShorthand));
            this.OPTION4(() => {
              this.CONSUME(ClassTok.Colon);
              this.CONSUME(ClassTok.LabelText);
            });
          },
        },
        {
          ALT: () => {
            this.CONSUME2(ClassTok.Colon);
            this.CONSUME2(ClassTok.LabelText);
          },
        },
      ]),
    );
  });
}

export const classParser = new ClassParser();
