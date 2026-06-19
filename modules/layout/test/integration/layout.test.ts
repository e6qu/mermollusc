import { brand, isOk, point } from "@m/std";
import type {
  ClassAst,
  ErAst,
  FlowchartAst,
  NodeId,
  RequirementAst,
  SequenceAst,
  StateAst,
} from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layout, layoutDiagram } from "../../src/shell/elk.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);
const aid = (s: string) => brand<string, "ActorId">(s);
const mid = (s: string) => brand<string, "MessageId">(s);
const sid = (s: string) => brand<string, "StateId">(s);
const tid = (s: string) => brand<string, "StateTransitionId">(s);
const erid = (s: string) => brand<string, "ErEntityId">(s);
const errid = (s: string) => brand<string, "ErRelId">(s);
const cid = (s: string) => brand<string, "ClassEntityId">(s);
const crid = (s: string) => brand<string, "ClassRelId">(s);

const A_THEN_B: FlowchartAst = {
  kind: "flowchart",
  direction: "TB",
  nodes: [
    { id: nid("A"), label: "A", shape: "rect" },
    { id: nid("B"), label: "B", shape: "rect" },
  ],
  edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: null }],
  subgraphs: [],
};

const yOf = (scene: { nodes: ReadonlyArray<{ id: string; bounds: { origin: { y: number } } }> }, id: string) =>
  scene.nodes.find((n) => n.id === id)?.bounds.origin.y ?? Number.NaN;

describe("layout", () => {
  it("positions a small flowchart into a non-degenerate scene", async () => {
    const ast: FlowchartAst = {
      kind: "flowchart",
      direction: "TB",
      nodes: [
        { id: nid("A"), label: "Start", shape: "rect" },
        { id: nid("B"), label: "End", shape: "round" },
      ],
      edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: null }],
      subgraphs: [],
    };

    const r = await layout(ast, new Map(), heuristicMeasure);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.nodes).toHaveLength(2);
    expect(r.value.edges).toHaveLength(1);
    const a = r.value.nodes[0];
    const b = r.value.nodes[1];
    if (a === undefined || b === undefined) throw new Error("missing nodes");
    expect(a.bounds.origin.y).not.toBe(b.bounds.origin.y);
    expect(r.value.edges[0]?.waypoints.length ?? 0).toBeGreaterThan(0);
    expect(r.value.extent.size.width).toBeGreaterThan(0);
  });

  it("nests subgraph members inside a sized container, with absolute coordinates", async () => {
    const ast: FlowchartAst = {
      kind: "flowchart",
      direction: "TB",
      nodes: [
        { id: nid("api"), label: "API", shape: "rect" },
        { id: nid("db"), label: "DB", shape: "rect" },
        { id: nid("user"), label: "User", shape: "rect" },
      ],
      edges: [
        { id: eid("e0"), from: nid("api"), to: nid("db"), kind: "arrow", label: null },
        { id: eid("e1"), from: nid("user"), to: nid("api"), kind: "arrow", label: null },
      ],
      subgraphs: [
        { id: nid("Backend"), label: "Backend", parent: null, nodes: [nid("api"), nid("db")] },
      ],
    };
    const r = await layout(ast, new Map(), heuristicMeasure);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const snid = (s: string) => brand<string, "SceneNodeId">(s);
    const byId = new Map(r.value.nodes.map((n) => [n.id, n]));
    const backend = byId.get(snid("Backend"));
    const api = byId.get(snid("api"));
    const user = byId.get(snid("user"));
    expect(backend?.shape).toBe("container");
    expect(api?.parent).toBe("Backend");
    expect(user?.parent).toBe(null);
    if (backend === undefined || api === undefined) throw new Error("missing nodes");
    // Member coordinates are absolute and fall within the container's box.
    const b = backend.bounds;
    const a = api.bounds;
    expect(a.origin.x).toBeGreaterThanOrEqual(b.origin.x);
    expect(a.origin.y).toBeGreaterThanOrEqual(b.origin.y);
    expect(a.origin.x + a.size.width).toBeLessThanOrEqual(b.origin.x + b.size.width);
    expect(a.origin.y + a.size.height).toBeLessThanOrEqual(b.origin.y + b.size.height);
  });

  it("relaxes around a seed: flipped seed order flips the layout", async () => {
    const clean = await layout(A_THEN_B, new Map(), heuristicMeasure);
    expect(isOk(clean)).toBe(true);
    if (!isOk(clean)) return;
    // clean top-down: A above B
    expect(yOf(clean.value, "A")).toBeLessThan(yOf(clean.value, "B"));

    const seed = new Map<NodeId, ReturnType<typeof point>>([
      [nid("A"), point(0, 300)],
      [nid("B"), point(0, 0)],
    ]);
    const relaxed = await layout(A_THEN_B, seed, heuristicMeasure);
    expect(isOk(relaxed)).toBe(true);
    if (!isOk(relaxed)) return;
    // seeded with A below B → relaxed layout keeps A below B
    expect(yOf(relaxed.value, "A")).toBeGreaterThan(yOf(relaxed.value, "B"));
  });

  it("layoutDiagram routes both families to a Scene", async () => {
    const flow = await layoutDiagram(A_THEN_B, heuristicMeasure);
    expect(isOk(flow)).toBe(true);

    const seq: SequenceAst = {
      kind: "sequence",
      actors: [
        { id: aid("X"), label: "X" },
        { id: aid("Y"), label: "Y" },
      ],
      messages: [{ id: mid("m0"), from: aid("X"), to: aid("Y"), text: "hi", kind: "solid" }],
    };
    const sequence = await layoutDiagram(seq, heuristicMeasure);
    expect(isOk(sequence)).toBe(true);
    if (!isOk(sequence)) return;
    expect(sequence.value.nodes).toHaveLength(2);
  });

  it("layoutDiagram lays out a state diagram through the ELK path", async () => {
    const stateAst: StateAst = {
      kind: "state",
      states: [
        { id: sid("__state_start"), label: "", kind: "start" },
        { id: sid("Idle"), label: "Idle", kind: "state" },
      ],
      transitions: [{ id: tid("t0"), from: sid("__state_start"), to: sid("Idle"), label: null }],
      composites: [],
    };
    const laid = await layoutDiagram(stateAst, heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;
    expect(laid.value.nodes.map((n) => n.id).sort()).toEqual(["Idle", "__state_start"]);
    // The start pseudo-state becomes a circle, the real state a rounded box.
    expect(laid.value.nodes.find((n) => n.id === "Idle")?.shape).toBe("round");
    expect(laid.value.nodes.find((n) => n.id === "__state_start")?.shape).toBe("circle");
    expect(laid.value.edges).toHaveLength(1);
  });

  it("layoutDiagram lays out an ER diagram, showing cardinality in the edge label", async () => {
    const erAst: ErAst = {
      kind: "er",
      entities: [
        {
          id: erid("CUSTOMER"),
          label: "CUSTOMER",
          attributes: [{ type: "string", name: "name", keys: ["PK"], comment: "" }],
        },
        { id: erid("ORDER"), label: "ORDER", attributes: [] },
      ],
      relationships: [
        {
          id: errid("r0"),
          from: erid("CUSTOMER"),
          to: erid("ORDER"),
          fromCard: "one",
          toCard: "zeroOrMany",
          identifying: true,
          label: "places",
        },
      ],
    };
    const laid = await layoutDiagram(erAst, heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;
    expect(laid.value.nodes.map((n) => n.id).sort()).toEqual(["CUSTOMER", "ORDER"]);
    expect(laid.value.nodes.every((n) => n.shape === "rect")).toBe(true);
    // The verb is the edge label; cardinality is on the ends (crow's-foot), not in the text.
    expect(laid.value.edges[0]?.label).toBe("places");
    expect(laid.value.edges[0]?.fromEnd).toBe("one");
    expect(laid.value.edges[0]?.toEnd).toBe("zeroOrMany");
    // CUSTOMER carries its attribute as a compartment row; ORDER has none.
    expect(laid.value.nodes.find((n) => n.id === "CUSTOMER")?.rows).toEqual(["string name PK"]);
    expect(laid.value.nodes.find((n) => n.id === "ORDER")?.rows).toBeNull();
  });

  it("layoutDiagram lays out a class diagram with field/method compartments + UML arrowheads", async () => {
    const classAst: ClassAst = {
      kind: "class",
      entities: [
        {
          id: cid("Animal"),
          label: "Animal",
          members: [
            { visibility: "public", text: "int age", kind: "field" },
            { visibility: "private", text: "name() String", kind: "method" },
          ],
        },
        { id: cid("Duck"), label: "Duck", members: [] },
      ],
      relationships: [
        {
          id: crid("r0"),
          from: cid("Animal"),
          to: cid("Duck"),
          fromArrow: "triangle",
          toArrow: "none",
          dashed: false,
          label: "extends",
        },
      ],
    };
    const laid = await layoutDiagram(classAst, heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;
    const animal = laid.value.nodes.find((n) => n.id === "Animal");
    // Fields then methods, split by an inner divider at the field count.
    expect(animal?.rows).toEqual(["+int age", "-name() String"]);
    expect(animal?.rowDivider).toBe(1);
    expect(laid.value.nodes.find((n) => n.id === "Duck")?.rows).toBeNull();
    // The hollow inheritance triangle sits at the base class (the `from` end).
    expect(laid.value.edges[0]?.fromEnd).toBe("triangle");
    expect(laid.value.edges[0]?.label).toBe("extends");
  });

  it("layoutDiagram lays out a requirement diagram: «kind» tag, field rows, verb-labelled arrows", async () => {
    const reqAst: RequirementAst = {
      kind: "requirement",
      entities: [
        {
          id: brand<string, "ReqEntityId">("test_req"),
          name: "test_req",
          kind: "requirement",
          fields: [
            { key: "id", value: "1" },
            { key: "risk", value: "high" },
          ],
        },
        {
          id: brand<string, "ReqEntityId">("test_entity"),
          name: "test_entity",
          kind: "element",
          fields: [],
        },
      ],
      relationships: [
        {
          id: brand<string, "ReqRelId">("r0"),
          from: brand<string, "ReqEntityId">("test_entity"),
          to: brand<string, "ReqEntityId">("test_req"),
          kind: "satisfies",
        },
      ],
    };
    const laid = await layoutDiagram(reqAst, heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;
    const req = laid.value.nodes.find((n) => n.id === "test_req");
    // «kind» tag in its own compartment (divider at row 1), then the fields.
    expect(req?.rows).toEqual(["«requirement»", "id: 1", "risk: high"]);
    expect(req?.rowDivider).toBe(1);
    // An element with no fields: just the «element» tag, no inner divider.
    expect(laid.value.nodes.find((n) => n.id === "test_entity")?.rows).toEqual(["«element»"]);
    expect(laid.value.nodes.find((n) => n.id === "test_entity")?.rowDivider).toBeNull();
    // The relationship renders as an open arrow labelled with its verb.
    expect(laid.value.edges[0]).toMatchObject({ label: "satisfies", toEnd: "arrowOpen" });
  });
});
