import { brand, isOk } from "@m/std";
import {
  parseC4WithSource,
  parseClassWithSource,
  parseCloudWithSource,
  parseErWithSource,
  parseGanttWithSource,
  parseGitGraphWithSource,
  parseRequirementWithSource,
  parseNetworkWithSource,
  parseSequenceWithSource,
  parseStateWithSource,
  parseMindmapWithSource,
  parseTimelineWithSource,
  parseWithSource,
} from "@m/parser";
import { describe, expect, it } from "vitest";
import {
  addEdgeLabel,
  restyleEdge,
  restyleSequenceMessage,
  addNode,
  connect,
  connectC4,
  connectClass,
  connectEr,
  connectMessage,
  connectMindmap,
  connectGitMerge,
  moveTimelineEvent,
  deleteTimelineEvent,
  deleteTimelinePeriod,
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

  it("rejects empty and bracket labels so a relabel/reshape can't write `A[]` or `A([)` (fuzz-found)", () => {
    const text = "flowchart TD\n  A[Start] --> B(Mid)\n";
    const src = sourceOf(text);
    expect(relabelNode(text, src, nid("A"), "").ok).toBe(false); // empty → would be `A[]`
    expect(relabelNode(text, src, nid("A"), "   ").ok).toBe(false); // whitespace-only
    expect(relabelNode(text, src, nid("B"), "[").ok).toBe(false); // opener → would be `B([)`
    expect(relabelNode(text, src, nid("A"), "x]").ok).toBe(false); // closer
    expect(reshapeNode(text, src, nid("A"), "", "round").ok).toBe(false); // empty reshape
    expect(reshapeNode(text, src, nid("A"), "a(b", "round").ok).toBe(false); // opener reshape
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

  it("restyleSequenceMessage rewrites the arrow token of a sequence message", () => {
    const text = "sequenceDiagram\n  A->>B: hi\n";
    const r = parseSequenceWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const arrowSpan = r.value.source.arrows.get(brand("m0"));
    expect(arrowSpan).toBeDefined();
    if (arrowSpan === undefined) return;
    const next = restyleSequenceMessage(text, arrowSpan, "dashedOpen");
    expect(next).toContain("A-->B: hi");
    const r2 = parseSequenceWithSource(next);
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) {
      expect(r2.value.ast.messages[0]?.kind).toBe("dashedOpen");
    }
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

  it("connectGitMerge appends a checkout + merge the git parser accepts", () => {
    const text = "gitGraph\n  commit\n  branch develop\n  commit\n";
    const out = connectGitMerge(
      text,
      brand<string, "GitBranchName">("main"),
      brand<string, "GitBranchName">("develop"),
    );
    expect(out).toContain("checkout main");
    expect(out).toContain("merge develop");
    const r = parseGitGraphWithSource(out);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.ast.commits.some((c) => c.merge)).toBe(true);
    // A self-merge is a no-op.
    expect(
      connectGitMerge(
        text,
        brand<string, "GitBranchName">("main"),
        brand<string, "GitBranchName">("main"),
      ),
    ).toBe(text);
  });

  it("moveTimelineEvent re-parents an event under another period (round-trips)", () => {
    const text = "timeline\n  2001 : Alpha : Beta\n  2002 : Gamma\n";
    const parsed = parseTimelineWithSource(text);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    const { ast, source } = parsed.value;
    const beta = ast.periods.flatMap((p) => p.events).find((e) => e.text === "Beta");
    const p2002 = ast.periods.find((p) => p.label === "2002");
    expect(beta).toBeDefined();
    expect(p2002).toBeDefined();
    if (beta === undefined || p2002 === undefined) return;
    const out = moveTimelineEvent(text, source, ast, beta.id, p2002.id);
    expect(out).toBe("timeline\n  2001 : Alpha\n  2002 : Gamma : Beta\n");
    const re = parseTimelineWithSource(out);
    expect(isOk(re)).toBe(true);
    if (isOk(re)) {
      const moved = re.value.ast.periods.find((p) => p.label === "2002");
      expect(moved?.events.map((e) => e.text)).toEqual(["Gamma", "Beta"]);
    }
  });

  it("covers git/timeline connect guard + quoting branches", () => {
    // A branch name with a space must be quoted in the appended merge.
    const out = connectGitMerge(
      "gitGraph\n  commit\n",
      brand<string, "GitBranchName">("main"),
      brand<string, "GitBranchName">("feature x"),
    );
    expect(out).toContain('merge "feature x"');

    const t = "timeline\n  2001 : Alpha\n";
    const parsed = parseTimelineWithSource(t);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    const { ast, source } = parsed.value;
    const period = ast.periods[0];
    const event = period?.events[0];
    expect(period).toBeDefined();
    expect(event).toBeDefined();
    if (period === undefined || event === undefined) return;
    // Already under that period → no-op; unknown event id → no-op.
    expect(moveTimelineEvent(t, source, ast, event.id, period.id)).toBe(t);
    expect(
      moveTimelineEvent(t, source, ast, brand<string, "TimelineEventId">("zz"), period.id),
    ).toBe(t);
  });

  it("timeline delete: an event drops its `: <event>` segment; a period drops its line + events", () => {
    const text = "timeline\n  2001 : Alpha : Beta\n  2002 : Gamma\n";
    const parsed = parseTimelineWithSource(text);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    const { ast, source } = parsed.value;
    const beta = ast.periods.flatMap((p) => p.events).find((e) => e.text === "Beta");
    const p2002 = ast.periods.find((p) => p.label === "2002");
    if (beta === undefined || p2002 === undefined) return;
    expect(deleteTimelineEvent(text, source, beta.id)).toBe(
      "timeline\n  2001 : Alpha\n  2002 : Gamma\n",
    );
    expect(deleteTimelinePeriod(text, source, p2002.id)).toBe("timeline\n  2001 : Alpha : Beta\n");
    // A period with `:`-continuation lines takes them (and their events) with it.
    const cont = "timeline\n  2001 : A\n    : B\n  2002 : C\n";
    const cp = parseTimelineWithSource(cont);
    if (isOk(cp)) {
      const first = cp.value.ast.periods.find((p) => p.label === "2001");
      if (first !== undefined) {
        expect(deleteTimelinePeriod(cont, cp.value.source, first.id)).toBe("timeline\n  2002 : C\n");
      }
    }
  });

  it("moveTimelineEvent re-parents to an earlier period too (reverse edit order)", () => {
    const text = "timeline\n  2001 : Alpha\n  2002 : Beta : Gamma\n";
    const parsed = parseTimelineWithSource(text);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    const { ast, source } = parsed.value;
    const gamma = ast.periods.flatMap((p) => p.events).find((e) => e.text === "Gamma");
    const p2001 = ast.periods.find((p) => p.label === "2001");
    if (gamma === undefined || p2001 === undefined) return;
    expect(moveTimelineEvent(text, source, ast, gamma.id, p2001.id)).toBe(
      "timeline\n  2001 : Alpha : Gamma\n  2002 : Beta\n",
    );
  });

  it("relabelNode wraps a bare node but still rejects an empty label", () => {
    const text = "flowchart TD\n  A --> B\n";
    const src = sourceOf(text);
    const ok = relabelNode(text, src, nid("A"), "Renamed");
    expect(isOk(ok)).toBe(true);
    if (isOk(ok)) expect(ok.value).toContain("A[Renamed]");
    expect(relabelNode(text, src, nid("A"), "").ok).toBe(false); // bare + empty → still rejected
  });

  it("timeline edits fail closed on a malformed span (the parser never emits one)", () => {
    // An event span not preceded by `:` — `eventSegmentStart`/`moveTimelineEvent` must bail, not corrupt.
    const text = "Alpha Beta";
    const ev = brand<string, "TimelineEventId">("e0");
    const pd = brand<string, "TimelinePeriodId">("p0");
    const source = {
      periods: new Map([[pd, { start: 0, end: 5 }]]),
      events: new Map([[ev, { start: 6, end: 10 }]]),
    };
    expect(deleteTimelineEvent(text, source, ev)).toBe(text);
    const ast = {
      kind: "timeline" as const,
      title: null,
      periods: [{ id: pd, label: "Alpha", section: null, events: [] }],
    };
    expect(moveTimelineEvent(text, source, ast, ev, pd)).toBe(text);
  });

  it("timeline delete is a no-op for an unknown id (guard branch)", () => {
    const text = "timeline\n  2001 : Alpha\n";
    const parsed = parseTimelineWithSource(text);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    const { source } = parsed.value;
    expect(deleteTimelineEvent(text, source, brand<string, "TimelineEventId">("zz"))).toBe(text);
    expect(deleteTimelinePeriod(text, source, brand<string, "TimelinePeriodId">("zz"))).toBe(text);
  });

  it("deleteEdge removes a network/cloud edge carrying a `: label`", () => {
    expect(deleteEdge('network\n  r1 -- web : "eth0"\n', nid("r1"), nid("web"))).toBe("network\n");
    expect(deleteEdge('cloud\n  a --> b : "https"\n', nid("a"), nid("b"))).toBe("cloud\n");
  });

  it("deleteStateEntity removes a special state's `<<fork>>` declaration line", () => {
    const text = "stateDiagram-v2\n  state fork <<fork>>\n  A --> fork\n  fork --> B\n";
    expect(deleteStateEntity(text, stid("fork"))).not.toContain("fork"); // decl + transitions gone
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

describe("edge label + style edits", () => {
  const arrowSpan = (text: string) => {
    const parsed = parseWithSource(text);
    if (!isOk(parsed)) throw new Error("parse");
    const span = parsed.value.source.arrows.get(brand<string, "EdgeId">("e0"));
    if (span === undefined) throw new Error("no arrow span");
    return span;
  };

  it("adds a label to a bare flowchart edge, and the result re-parses with the label", () => {
    const text = "flowchart TD\n  A --> B\n";
    const out = addEdgeLabel(text, arrowSpan(text), "yes");
    if (!isOk(out)) throw new Error(out.error.message);
    expect(out.value).toBe("flowchart TD\n  A -->|yes| B\n");
    const re = parseWithSource(out.value);
    expect(isOk(re) && re.value.ast.edges[0]?.label).toBe("yes");
  });

  it("rejects an edge label that would break the pipe (empty or containing |)", () => {
    const text = "flowchart TD\n  A --> B\n";
    const span = arrowSpan(text);
    expect(addEdgeLabel(text, span, "").ok).toBe(false);
    expect(addEdgeLabel(text, span, "a|b").ok).toBe(false);
  });

  it("restyles an edge by rewriting the arrow, preserving any label", () => {
    const labeled = "flowchart TD\n  A -->|go| B\n";
    const dotted = restyleEdge(labeled, arrowSpan(labeled), "dotted");
    expect(dotted).toBe("flowchart TD\n  A -.->|go| B\n");
    const re = parseWithSource(dotted);
    expect(isOk(re) && re.value.ast.edges[0]?.kind).toBe("dotted");
    if (isOk(re)) expect(re.value.ast.edges[0]?.label).toBe("go");
  });

  it("cycles through every flowchart edge kind and stays parseable", () => {
    let text = "flowchart TD\n  A --> B\n";
    for (const kind of ["open", "dotted", "thick", "arrow"] as const) {
      text = restyleEdge(text, arrowSpan(text), kind);
      const re = parseWithSource(text);
      expect(isOk(re) && re.value.ast.edges[0]?.kind).toBe(kind);
    }
  });
});
