import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { print } from "../../src/core/print.js";
import { parse } from "../../src/shell/parse.js";

describe("parse", () => {
  it("parses a simple flowchart", () => {
    const r = parse("flowchart TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(End)\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const ast = r.value;
    expect(ast.direction).toBe("TB");
    expect(ast.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(ast.nodes.find((n) => n.id === "B")?.shape).toBe("diamond");
    expect(ast.edges).toHaveLength(2);
    expect(ast.edges[1]?.label).toBe("yes");
  });

  it("round-trips parse(print(ast))", () => {
    const src = "flowchart LR\n  A[Start] --> B(Mid)\n  B -.-> C{End}\n  A ==>|x| C\n";
    const first = parse(src);
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) return;
    const second = parse(print(first.value));
    expect(isOk(second)).toBe(true);
    if (!isOk(second)) return;
    expect(second.value).toEqual(first.value);
  });

  it("parses stadium `([…])` and circle `((…))` shapes", () => {
    const r = parse("flowchart TD\n  A([Stadium]) --> B((Circle))\n  B --> C(Round)\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ["A", "Stadium", "stadium"],
      ["B", "Circle", "circle"],
      ["C", "Round", "round"],
    ]);
  });

  it("claims a node for the subgraph it's declared in, even when a top-level edge references it", () => {
    const text = "flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n";
    const r = parse(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.subgraphs).toHaveLength(1);
    const sg = r.value.subgraphs[0];
    expect([sg?.id, sg?.label, sg?.parent]).toEqual(["Backend", "Backend", null]);
    expect(sg?.nodes).toEqual(["api", "db"]);
    // Canonical node order: top-level nodes first, then the subgraph's.
    expect(r.value.nodes.map((n) => n.id)).toEqual(["user", "api", "db"]);
  });

  it("parses nested subgraphs with a title", () => {
    const text =
      "flowchart TD\n  subgraph Outer[Outer box]\n    subgraph Inner\n      a[A]\n    end\n    b[B]\n  end\n";
    const r = parse(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const outer = r.value.subgraphs.find((s) => s.id === "Outer");
    const inner = r.value.subgraphs.find((s) => s.id === "Inner");
    expect([outer?.label, outer?.parent, outer?.nodes]).toEqual(["Outer box", null, ["b"]]);
    expect([inner?.label, inner?.parent, inner?.nodes]).toEqual(["Inner", "Outer", ["a"]]);
  });

  it("round-trips a subgraph (declared before a top-level node) through print", () => {
    const text = "flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n";
    const first = parse(text);
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) return;
    const second = parse(print(first.value));
    expect(isOk(second)).toBe(true);
    if (!isOk(second)) return;
    expect(second.value).toEqual(first.value);
  });

  it("fails loudly on an invalid direction", () => {
    expect(isErr(parse("flowchart ZZ\n  A --> B\n"))).toBe(true);
  });
});
