import { brand, isOk } from "@m/std";
import {
  parseC4WithSource,
  parseClassWithSource,
  parseCloudWithSource,
  parseErWithSource,
  parseGanttWithSource,
  parseRequirementWithSource,
  parseNetworkWithSource,
  parseSequenceWithSource,
  parseStateWithSource,
  parseMindmapWithSource,
  parseWithSource,
} from "@m/parser";
import { describe, expect, it } from "vitest";
import {
  addNode,
  connect,
  connectC4,
  connectClass,
  connectEr,
  connectMessage,
  connectMindmap,
  deleteMindmapNode,
  connectRequirement,
  connectUndirected,
  deleteActor,
  deleteC4,
  deleteC4Rel,
  deleteClassEntity,
  deleteClassRel,
  deleteEdge,
  deleteErEntity,
  deleteErRel,
  deleteBlockGroup,
  deleteFlowSubgraph,
  deleteGroupBlock,
  renameBlockId,
  wrapCloudGroup,
  deleteLineAt,
  deleteMessage,
  deleteNode,
  deleteRequirementEntity,
  deleteRequirementRel,
  deleteStateEntity,
  patchSpan,
  relabelNode,
  reshapeNode,
} from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const cid = (s: string) => brand<string, "C4ElementId">(s);
const aid = (s: string) => brand<string, "ActorId">(s);
const erid = (s: string) => brand<string, "ErEntityId">(s);
const clid = (s: string) => brand<string, "ClassEntityId">(s);
const rqid = (s: string) => brand<string, "ReqEntityId">(s);
const stid = (s: string) => brand<string, "StateId">(s);

const sourceOf = (text: string) => {
  const r = parseWithSource(text);
  if (!isOk(r)) throw new Error(`parse failed: ${r.error.errors.join("; ")}`);
  return r.value.source;
};

describe("relabelNode", () => {
  it("splices a bracketed node's label, preserving the rest of the file", () => {
    const text = "flowchart TD\n  A[Start] --> B(End)\n";
    const r = relabelNode(text, sourceOf(text), nid("A"), "Begin");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toBe("flowchart TD\n  A[Begin] --> B(End)\n");

    const reparsed = parseWithSource(r.value);
    expect(isOk(reparsed)).toBe(true);
    if (!isOk(reparsed)) return;
    expect(reparsed.value.ast.nodes.find((n) => n.id === "A")?.label).toBe("Begin");
  });

  it("wraps a bare node in brackets when relabeling", () => {
    const text = "flowchart TD\n  A --> B\n";
    const r = relabelNode(text, sourceOf(text), nid("A"), "Start");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toBe("flowchart TD\n  A[Start] --> B\n");
  });

  it("fails loudly for an unknown node", () => {
    const text = "flowchart TD\n  A --> B\n";
    expect(relabelNode(text, sourceOf(text), nid("Z"), "x").ok).toBe(false);
  });

  it("reshapeNode rewrites a node's shape brackets across every shape, keeping the label", () => {
    const cases: ReadonlyArray<readonly ["rect" | "round" | "stadium" | "circle" | "diamond", string]> =
      [
        ["round", "A(Start)"],
        ["stadium", "A([Start])"],
        ["circle", "A((Start))"],
        ["diamond", "A{Start}"],
        ["rect", "A[Start]"],
      ];
    for (const [shape, expected] of cases) {
      const text = "flowchart TD\n  A[Start] --> B[End]\n";
      const r = reshapeNode(text, sourceOf(text), nid("A"), "Start", shape);
      expect(isOk(r)).toBe(true);
      if (!isOk(r)) continue;
      expect(r.value).toBe(`flowchart TD\n  ${expected} --> B[End]\n`);
      const reparsed = parseWithSource(r.value);
      expect(isOk(reparsed)).toBe(true);
      if (!isOk(reparsed)) continue;
      const a = reparsed.value.ast.nodes.find((n) => n.id === "A");
      expect(a?.shape).toBe(shape);
      expect(a?.label).toBe("Start"); // label preserved through the reshape
    }
  });

  it("reshapeNode wraps a bare node (its id becomes the label)", () => {
    const text = "flowchart TD\n  A --> B\n";
    const r = reshapeNode(text, sourceOf(text), nid("A"), "A", "diamond");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toBe("flowchart TD\n  A{A} --> B\n");
  });

  it("patchSpan replaces exactly the given range", () => {
    expect(patchSpan("hello world", { start: 6, end: 11 }, "there")).toBe("hello there");
  });

  it("addNode appends a node declaration the parser accepts", () => {
    const next = addNode("flowchart TD\n  A --> B\n", nid("C"), "Gamma", "round");
    expect(next).toContain("C(Gamma)");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.nodes.find((n) => n.id === "C")).toMatchObject({
      label: "Gamma",
      shape: "round",
    });
  });

  it("connect appends an edge the parser accepts", () => {
    const next = connect("flowchart TD\n  A[x]\n  B[y]\n", nid("A"), nid("B"), "dotted");
    expect(next).toContain("A -.-> B");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(
      r.value.ast.edges.some((e) => e.from === "A" && e.to === "B" && e.kind === "dotted"),
    ).toBe(true);
  });

  it("connectUndirected appends a link the network parser accepts", () => {
    const next = connectUndirected('network\n  server a "A"\n  server b "B"\n', nid("a"), nid("b"));
    expect(next).toContain("a -- b");
    const r = parseNetworkWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.links.some((l) => l.from === "a" && l.to === "b")).toBe(true);
  });

  it("connectC4 appends a Rel the C4 parser accepts", () => {
    const next = connectC4('C4Context\n  Person(a, "A")\n  System(b, "B")\n', cid("a"), cid("b"));
    expect(next).toContain('Rel(a, b, "")');
    const r = parseC4WithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.rels.some((rel) => rel.from === "a" && rel.to === "b")).toBe(true);
  });

  it("connectEr appends a relationship the ER parser accepts, and deleteErRel removes it", () => {
    const next = connectEr("erDiagram\n  CUSTOMER ||--o{ ORDER : places\n", erid("A"), erid("B"));
    expect(next).toContain("A ||--o{ B : relates");
    const r = parseErWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.relationships.some((rel) => rel.from === "A" && rel.to === "B")).toBe(true);

    const removed = deleteErRel(next, erid("A"), erid("B"));
    expect(removed).not.toContain("A ||--o{ B"); // the added relationship is gone
    expect(removed).toContain("CUSTOMER ||--o{ ORDER"); // the original stays
  });

  it("connectClass appends a relationship the class parser accepts, and deleteClassRel removes it", () => {
    const next = connectClass("classDiagram\n  Animal <|-- Duck\n", clid("A"), clid("B"));
    expect(next).toContain("A --> B");
    const r = parseClassWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.relationships.some((rel) => rel.from === "A" && rel.to === "B")).toBe(true);

    const removed = deleteClassRel(next, clid("A"), clid("B"));
    expect(removed).not.toContain("A --> B"); // the added relationship is gone
    expect(removed).toContain("Animal <|-- Duck"); // the original stays
  });

  it("connectRequirement appends a relationship the requirement parser accepts, and deleteRequirementRel removes it", () => {
    const next = connectRequirement(
      "requirementDiagram\n  element a { type: x }\n  requirement b { id: 1 }\n",
      rqid("a"),
      rqid("b"),
    );
    expect(next).toContain("a - satisfies -> b");
    const r = parseRequirementWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.relationships.some((rel) => rel.from === "a" && rel.to === "b")).toBe(true);

    const removed = deleteRequirementRel(next, rqid("a"), rqid("b"));
    expect(removed).not.toContain("a - satisfies -> b");
    expect(removed).toContain("requirement b"); // the entities stay
  });

  it("deleteErEntity removes a brace-bodied entity (block + closing brace) and incident relationships", () => {
    const text =
      "erDiagram\n" +
      "  CUSTOMER {\n    string name PK\n    string email UK\n  }\n" +
      "  ORDER {\n    int id PK\n  }\n" +
      "  CUSTOMER ||--o{ ORDER : places\n";
    const removed = deleteErEntity(text, erid("CUSTOMER"));
    // No orphaned body rows, no dangling brace, no incident relationship, and ORDER survives intact.
    expect(removed).not.toContain("string name PK");
    expect(removed).not.toContain("string email UK");
    expect(removed).not.toMatch(/CUSTOMER/);
    expect(removed).not.toContain("places");
    expect(removed).toContain("ORDER {");
    expect(removed).toContain("int id PK");
    // The result still parses cleanly (no stray `}`).
    const r = parseErWithSource(removed);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.ast.entities.map((e) => e.id)).toEqual(["ORDER"]);
  });

  it("deleteClassEntity removes a class block, its `:` shorthand members, and incident relationships", () => {
    const text =
      "classDiagram\n" +
      "  class Animal {\n    +int age\n  }\n" +
      "  Animal : +move() void\n" +
      "  class Duck {\n    +String beak\n  }\n" +
      "  Animal <|-- Duck\n";
    const removed = deleteClassEntity(text, clid("Animal"));
    expect(removed).not.toContain("+int age");
    expect(removed).not.toContain("+move() void");
    expect(removed).not.toMatch(/Animal/);
    expect(removed).toContain("class Duck");
    expect(removed).toContain("+String beak");
    const r = parseClassWithSource(removed);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.ast.entities.map((e) => e.id)).toEqual(["Duck"]);
  });

  it("deleteRequirementEntity removes a requirement block and incident relationships", () => {
    const text =
      "requirementDiagram\n" +
      "  requirement r {\n    id: 1\n    risk: high\n  }\n" +
      "  element e {\n    type: sim\n  }\n" +
      "  e - satisfies -> r\n";
    const removed = deleteRequirementEntity(text, rqid("r"));
    expect(removed).not.toContain("risk: high");
    expect(removed).not.toContain("satisfies");
    expect(removed).not.toMatch(/requirement r\b/);
    expect(removed).toContain("element e");
    expect(removed).toContain("type: sim");
    const parsed = parseRequirementWithSource(removed);
    expect(isOk(parsed)).toBe(true);
    if (isOk(parsed)) expect(parsed.value.ast.entities.map((en) => en.id)).toEqual(["e"]);
  });

  it("deleteStateEntity removes a composite state's whole block, its transitions, description, and note", () => {
    const text =
      "stateDiagram-v2\n" +
      "  [*] --> Idle\n" +
      "  state Active {\n    [*] --> Running\n    Running --> [*]\n  }\n" +
      "  Active : working\n" +
      "  note right of Active : busy\n" +
      "  Idle --> Active : go\n" +
      "  Active --> Idle : stop\n";
    const removed = deleteStateEntity(text, stid("Active"));
    // the composite body and its closing brace are gone — not orphaned
    expect(removed).not.toContain("Running");
    expect(removed).not.toMatch(/state Active\b/);
    expect(removed).not.toContain("working");
    expect(removed).not.toContain("note right of Active");
    expect(removed).not.toContain("Idle --> Active");
    expect(removed).not.toContain("Active --> Idle");
    // the unrelated state and its transition survive
    expect(removed).toContain("[*] --> Idle");
    // and the result is still parseable (no dangling `}` / orphaned rows)
    const parsed = parseStateWithSource(removed);
    expect(isOk(parsed)).toBe(true);
    if (isOk(parsed)) expect(parsed.value.ast.states.map((n) => n.id)).not.toContain("Active");
  });

  it("deleteStateEntity on a non-composite state drops only its transitions and description", () => {
    const text = "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Done : finish\n  Done : terminal\n";
    const removed = deleteStateEntity(text, stid("Done"));
    expect(removed).not.toContain("Idle --> Done");
    expect(removed).not.toContain("terminal");
    expect(removed).toContain("[*] --> Idle");
    expect(isOk(parseStateWithSource(removed))).toBe(true);
  });

  it("connectMessage appends a message the sequence parser accepts", () => {
    const next = connectMessage("sequenceDiagram\n  A->>B: hi\n", aid("A"), aid("B"));
    expect(next).toContain("A->>B: message");
    const r = parseSequenceWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.messages.filter((m) => m.from === "A" && m.to === "B")).toHaveLength(2);
  });

  it("deleteNode removes the node's declaration and its edges", () => {
    const next = deleteNode("flowchart TD\n  A[x]\n  B[y]\n  A --> B\n", nid("A"));
    expect(next).not.toContain("A[x]");
    expect(next).not.toContain("A --> B");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.nodes.map((n) => n.id)).toEqual(["B"]);
  });

  it("deleteNode does not match an id that only appears inside a label", () => {
    const text = "flowchart TD\n  A[mentions B]\n  C --> A\n";
    expect(deleteNode(text, nid("B"))).toBe(text);
  });

  it("deleteLineAt removes a task line by its label span, including an auto-id task", () => {
    const text = "gantt\n  dateFormat YYYY-MM-DD\n  Design :des, 2024-01-01, 5d\n  Review : after des, 2d\n";
    const r = parseGanttWithSource(text);
    if (!isOk(r)) throw new Error(`parse failed: ${r.error.errors.join("; ")}`);
    // "Review" is auto-numbered (no explicit id), so only its label span can find it.
    const review = r.value.ast.tasks.find((t) => t.label === "Review");
    expect(review).toBeDefined();
    if (review === undefined) return;
    const span = r.value.source.tasks.get(review.id);
    expect(span).toBeDefined();
    if (span === undefined) return;
    const next = deleteLineAt(text, span);
    expect(next).not.toContain("Review");
    expect(next).toContain("Design :des"); // the other task and the directives survive
    const after = parseGanttWithSource(next);
    expect(isOk(after)).toBe(true);
    if (!isOk(after)) return;
    expect(after.value.ast.tasks.map((t) => t.label)).toEqual(["Design"]);
  });

  it("deleteLineAt removes only the spanned line, leaving the first and last lines intact", () => {
    const text = "gantt\n  A :a, 2024-01-01, 1d\n  B :b, 2024-01-02, 1d\n";
    const r = parseGanttWithSource(text);
    if (!isOk(r)) throw new Error("parse failed");
    const a = r.value.ast.tasks.find((t) => t.label === "A");
    if (a === undefined) throw new Error("no A");
    const span = r.value.source.tasks.get(a.id);
    if (span === undefined) throw new Error("no span");
    expect(deleteLineAt(text, span)).toBe("gantt\n  B :b, 2024-01-02, 1d\n");
  });

  it("deleteEdge removes the standalone edge line, keeping declarations and other edges", () => {
    const next = deleteEdge("flowchart TD\n  A[x]\n  B[y]\n  A -->|go| B\n  B --> C\n", nid("A"), nid("B"));
    expect(next).not.toContain("A -->|go| B");
    expect(next).toContain("A[x]");
    expect(next).toContain("B --> C");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.edges.map((e) => [e.from, e.to])).toEqual([["B", "C"]]);
  });

  it("deleteEdge leaves multi-hop chains intact (only matches a 2-id edge line)", () => {
    const text = "flowchart TD\n  A --> B --> C\n";
    expect(deleteEdge(text, nid("A"), nid("B"))).toBe(text);
  });

  it("deleteC4 removes a leaf element and its relations", () => {
    const text = 'C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "uses")\n';
    const next = deleteC4(text, cid("a"));
    expect(next).not.toContain("Person(a");
    expect(next).not.toContain("Rel(a, b");
    expect(next).toContain("System(b");
    const r = parseC4WithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.elements.map((e) => e.id)).toEqual(["b"]);
  });

  it("deleteC4 removes a boundary's whole { … } block and its nested elements", () => {
    const text =
      'C4Context\n  Person(u, "U")\n  Boundary(bk, "Backend") {\n    Container(api, "API")\n  }\n  Rel(u, api, "x")\n';
    const next = deleteC4(text, cid("bk"));
    expect(next).not.toContain("Boundary(bk");
    expect(next).not.toContain("Container(api"); // nested element went with the block
    expect(next).not.toContain("Rel(u, api");
    expect(next).toContain('Person(u, "U")');
    const r = parseC4WithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.elements.map((e) => e.id)).toEqual(["u"]);
    expect(r.value.ast.rels).toHaveLength(0);
  });

  it("deleteC4Rel removes a specific relation, keeping the elements", () => {
    const text = 'C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "uses")\n';
    const next = deleteC4Rel(text, cid("a"), cid("b"));
    expect(next).not.toContain("Rel(a, b");
    const r = parseC4WithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.rels).toHaveLength(0);
    expect(r.value.ast.elements).toHaveLength(2);
  });

  it("deleteActor removes a participant and every message touching it", () => {
    const text = "sequenceDiagram\n  participant A\n  A->>B: hi\n  B->>C: yo\n";
    const next = deleteActor(text, aid("A"));
    expect(next).not.toContain("participant A");
    expect(next).not.toContain("A->>B");
    expect(next).toContain("B->>C: yo");
    const r = parseSequenceWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.messages.map((m) => [m.from, m.to])).toEqual([["B", "C"]]);
  });

  it("deleteMessage removes the first message between two actors", () => {
    const text = "sequenceDiagram\n  A->>B: one\n  A->>B: two\n";
    const next = deleteMessage(text, aid("A"), aid("B"));
    expect(next).not.toContain("one");
    expect(next).toContain("two");
  });

  it("connectMindmap re-parents a node's subtree under the target, re-indented", () => {
    const text = "mindmap\n  root\n    A\n      A1\n    B\n";
    const r = parseMindmapWithSource(text);
    if (!isOk(r)) throw new Error("parse");
    const { ast, source } = r.value;
    const idOf = (label: string): string => {
      const n = ast.nodes.find((x) => x.label === label);
      if (n === undefined) throw new Error(`no ${label}`);
      return n.id;
    };
    // Make B a child of A: B moves to A's first child, indented one level deeper.
    const next = connectMindmap(text, source, ast, brand(idOf("A")), brand(idOf("B")));
    expect(next).toBe("mindmap\n  root\n    A\n      B\n      A1\n");
    const r2 = parseMindmapWithSource(next);
    if (!isOk(r2)) throw new Error("reparse");
    const a = r2.value.ast.nodes.find((n) => n.label === "A");
    const b = r2.value.ast.nodes.find((n) => n.label === "B");
    expect(b?.parent).toBe(a?.id);
  });

  it("connectMindmap is a no-op for the root, a cycle, or an existing child", () => {
    const text = "mindmap\n  root\n    A\n      A1\n";
    const r = parseMindmapWithSource(text);
    if (!isOk(r)) throw new Error("parse");
    const { ast, source } = r.value;
    const idOf = (label: string): string => {
      const n = ast.nodes.find((x) => x.label === label);
      if (n === undefined) throw new Error(`no ${label}`);
      return n.id;
    };
    const mm = (p: string, c: string): string =>
      connectMindmap(text, source, ast, brand(idOf(p)), brand(idOf(c)));
    expect(mm("A", "root")).toBe(text); // can't re-parent the root
    expect(mm("A1", "A")).toBe(text); // A under its own descendant A1 → cycle
    expect(mm("A", "A1")).toBe(text); // A1 is already A's child → no change
  });

  it("deleteMindmapNode removes the node and its whole subtree", () => {
    const text = "mindmap\n  root\n    A\n      A1\n    B\n";
    const r = parseMindmapWithSource(text);
    if (!isOk(r)) throw new Error("parse");
    const { ast, source } = r.value;
    const idOf = (label: string): string => {
      const n = ast.nodes.find((x) => x.label === label);
      if (n === undefined) throw new Error(`no ${label}`);
      return n.id;
    };
    // Deleting A also removes its child A1; sibling B is untouched.
    expect(deleteMindmapNode(text, source, ast, brand(idOf("A")))).toBe(
      "mindmap\n  root\n    B\n",
    );
    // Deleting a leaf removes just its line.
    expect(deleteMindmapNode(text, source, ast, brand(idOf("B")))).toBe(
      "mindmap\n  root\n    A\n      A1\n",
    );
  });

  it("renameBlockId rewrites every standalone occurrence of a composite id (opener + edges)", () => {
    const text = "block-beta\n  x\n  block:grp\n    y\n  end\n  x --> grp\n  grpExtra\n";
    const out = renameBlockId(text, "grp", "svc");
    expect(out).toContain("block:svc"); // the opener renamed
    expect(out).toContain("x --> svc"); // the edge endpoint renamed
    expect(out).toContain("grpExtra"); // a different identifier left alone
    expect(out).not.toContain("grp\n"); // no stray old id
  });

  it("covers no-op / guard branches of the new delete + rename helpers", () => {
    // deleteGroupBlock on an unbalanced (never-closed) group → unchanged.
    expect(deleteGroupBlock('network\n  group "g" {\n    server x\n', { start: 16, end: 17 })).toBe(
      'network\n  group "g" {\n    server x\n',
    );
    // wrapCloudGroup with out-of-range indices → unchanged (filtered, then < 2).
    expect(wrapCloudGroup("cloud\n  compute a\n", [99], "G")).toBe("cloud\n  compute a\n");
    // renameBlockId with an empty old id → unchanged.
    expect(renameBlockId("block-beta\n  a\n", "", "b")).toBe("block-beta\n  a\n");
    // deleteEdge with no matching edge → unchanged.
    expect(deleteEdge("flowchart TD\n  A --> B\n", nid("X"), nid("Y"))).toBe(
      "flowchart TD\n  A --> B\n",
    );
  });

  it("reshapeNode rejects a label containing the target shape's closer", () => {
    const text = "flowchart TD\n  A --> B\n";
    const r = reshapeNode(text, sourceOf(text), nid("A"), "a]b", "rect");
    expect(r.ok).toBe(false);
  });

  it("deleteFlowSubgraph removes a `subgraph … end` block whole (balancing nesting)", () => {
    const text = "flowchart TD\n  subgraph G1\n    A\n    subgraph G2\n      B\n    end\n  end\n  A --> B\n";
    expect(deleteFlowSubgraph(text, nid("G1"))).toBe("flowchart TD\n  A --> B\n");
    expect(deleteFlowSubgraph(text, nid("G2"))).toBe(
      "flowchart TD\n  subgraph G1\n    A\n  end\n  A --> B\n",
    );
    expect(deleteFlowSubgraph(text, nid("nope"))).toBe(text); // unknown → no-op
  });

  it("deleteActor drops `note … of <actor>` lines so the source stays parseable", () => {
    const text = "sequenceDiagram\n  Alice->>Bob: hi\n  note right of Alice: thinking\n  note over Alice,Bob: chat\n";
    expect(deleteActor(text, aid("Alice"))).toBe("sequenceDiagram\n");
  });

  it("deleteEdge removes only the first of parallel edges", () => {
    const text = "flowchart TD\n  A --> B\n  A --> B\n";
    expect(deleteEdge(text, nid("A"), nid("B"))).toBe("flowchart TD\n  A --> B\n");
  });

  it("deleteGroupBlock ignores braces inside a quoted label", () => {
    const text = 'network\n  group "a{b}c" {\n    server x\n  }\n  server y\n';
    expect(deleteGroupBlock(text, { start: text.indexOf('"a{b') + 1, end: text.indexOf('}c"') + 2 })).toBe(
      "network\n  server y\n",
    );
  });

  it("wrapCloudGroup gathers the given lines into a new `group \"…\" { … }`, parseable", () => {
    const text = 'cloud\n  compute a "A"\n  compute b "B"\n  database c "C"\n';
    // Lines 1 and 2 (the two compute leaves) → a group; line 3 (database) stays.
    const next = wrapCloudGroup(text, [1, 2], "Tier");
    expect(next).toBe(
      'cloud\n  group "Tier" {\n    compute a "A"\n    compute b "B"\n  }\n  database c "C"\n',
    );
    const r = parseCloudWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.groups).toHaveLength(1);
    const byId = new Map(r.value.ast.nodes.map((n) => [n.id, n]));
    expect(byId.get(nid("a"))?.parent).toBe(r.value.ast.groups[0]?.id); // a moved into the group
    expect(byId.get(nid("c"))?.parent).toBeNull(); // c stayed top-level
    expect(wrapCloudGroup(text, [1], "Tier")).toBe(text); // < 2 lines → no-op
  });

  it("deleteGroupBlock removes a brace-delimited `group \"…\" { … }` whole, balancing nesting", () => {
    const text =
      'network\n  group "DMZ" {\n    server web "Web"\n    group "Inner" {\n      host h\n    }\n  }\n  server db "DB"\n';
    // The label span of the outer group (inside its quotes).
    const outer = { start: text.indexOf('"DMZ"') + 1, end: text.indexOf('"DMZ"') + 4 };
    expect(deleteGroupBlock(text, outer)).toBe('network\n  server db "DB"\n');
    // The inner group, by its label span — outer stays.
    const inner = { start: text.indexOf('"Inner"') + 1, end: text.indexOf('"Inner"') + 6 };
    expect(deleteGroupBlock(text, inner)).toBe(
      'network\n  group "DMZ" {\n    server web "Web"\n  }\n  server db "DB"\n',
    );
  });

  it("deleteBlockGroup removes a `block:id … end` composite whole, balancing nested composites", () => {
    const text = "block-beta\n  a\n  block:svc\n    api\n    block:inner\n      x\n    end\n  end\n  c\n";
    // Deleting the outer composite takes its body (and the nested composite) with it.
    expect(deleteBlockGroup(text, brand("svc"))).toBe("block-beta\n  a\n  c\n");
    // Deleting only the inner composite leaves the outer intact.
    expect(deleteBlockGroup(text, brand("inner"))).toBe(
      "block-beta\n  a\n  block:svc\n    api\n  end\n  c\n",
    );
    // Unknown id is a no-op.
    expect(deleteBlockGroup(text, brand("nope"))).toBe(text);
  });
});
