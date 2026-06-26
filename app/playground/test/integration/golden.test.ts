import {
  containersEncloseMembers,
  heuristicMeasure,
  layoutDiagram,
  layoutEnergy,
  noSiblingOverlaps,
  pieSlicesTileCircle,
} from "@m/layout";
import { parseDiagram } from "@m/parser";
import { toDisplayList } from "@m/renderer";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";

// Deterministic pipeline goldens: parse → layout (default heuristic text measurer, so no canvas or
// system fonts) → display list, normalised to rounded-integer strings and snapshotted. These pin
// the geometry of the full stack — the kind of regression that pixels would catch but unit tests
// miss (e.g. an edge label drifting onto a node). Sub-pixel jitter is rounded away; a real
// coordinate change updates the snapshot and fails the diff. Refresh intentionally with `-u`.
const SAMPLES: ReadonlyArray<{ readonly name: string; readonly text: string }> = [
  { name: "flowchart", text: "flowchart TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(Process)\n  B -->|no| D(End)\n  C --> D\n" },
  { name: "sequence", text: "sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello\n  B-->>A: Hi there\n" },
  {
    name: "c4",
    text: 'C4Context\n  Person(alice, "Alice")\n  Boundary(b, "Backend") {\n    Container(api, "API")\n    Container(db, "Database")\n  }\n  Rel(alice, api, "uses")\n',
  },
  { name: "block", text: 'block-beta\n  columns 2\n  a["Web"]\n  b["API"]\n  c["DB"]\n  a --> b\n  b --> c\n' },
  {
    name: "state",
    text: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Loading : fetch\n  Loading --> Ready : ok\n  Ready --> [*]\n",
  },
  {
    name: "state-composite",
    text: "stateDiagram-v2\n  [*] --> Active\n  state Active {\n    [*] --> Running\n    Running --> Paused : pause\n    Paused --> Running : resume\n  }\n  Active --> [*]\n",
  },
  {
    name: "network",
    text: 'network\n  cloud net "Internet"\n  router r1 "Edge"\n  server web "Web"\n  net -- r1\n  r1 -- web : "eth0"\n',
  },
  {
    name: "cloud",
    text: 'cloud\n  group "AWS" {\n    compute web "Web"\n    storage assets "Assets"\n  }\n  web -- assets\n',
  },
  {
    name: "er",
    text: 'erDiagram\n  CUSTOMER {\n    string name PK\n    int age\n  }\n  CUSTOMER ||--o{ ORDER : places\n',
  },
  {
    name: "class",
    text: "classDiagram\n  class Animal {\n    <<abstract>>\n    +int age\n    +move() void\n  }\n  Animal <|-- Duck\n  Animal *-- Leg\n",
  },
  {
    name: "requirement",
    text: "requirementDiagram\n  requirement req {\n    id: 1\n    risk: high\n  }\n  element ent {\n    type: simulation\n  }\n  ent - satisfies -> req\n",
  },
  {
    name: "gitGraph",
    text: 'gitGraph\n  commit id: "init"\n  branch develop\n  commit id: "work"\n  checkout main\n  commit id: "fix"\n  merge develop tag: "v1"\n',
  },
  {
    name: "timeline",
    text: "timeline\n  title History\n  section Early\n    2002 : LinkedIn\n    2004 : Facebook : Google\n  section Growth\n    2006 : Twitter\n",
  },
  {
    name: "mindmap",
    text: "mindmap\n  root((Root))\n    Branch A\n      Leaf 1\n      Leaf 2\n    Branch B\n",
  },
  {
    name: "pie",
    text: 'pie donut\n  title Pets\n  "Dogs" : 75\n  "Cats" : 25\n',
  },
  {
    name: "gantt",
    text: "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Work\n    Research :a, 2024-01-01, 5d\n    Build :b, after a, 1w\n    Docs :d, 2024-01-01, 3d\n    Ship :milestone, m, after b d, 0d\n",
  },
  {
    name: "gantt-excludes",
    // 2024-01-04 is a Thursday; with weekends excluded the bars stretch across Sat/Sun and `after`
    // starts shift onto the next working day.
    text: "gantt\n  title Sprint\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  section Work\n    Build :b, 2024-01-04, 5d\n    Test :t, after b, 3d\n",
  },
  {
    name: "dot",
    text: 'digraph { rankdir=LR\n  a [shape=box]\n  a -> b -> c\n  b [label="middle"]\n}\n',
  },
];

const r = (n: number): number => Math.round(n);

const normalize = (cmds: ReturnType<typeof toDisplayList>): string[] =>
  cmds.map((c) => {
    switch (c.kind) {
      case "band":
        return `band ${r(c.x)},${r(c.y)} ${r(c.width)}x${r(c.height)} ${c.fill}`;
      case "box":
        return `box ${r(c.x)},${r(c.y)} ${r(c.width)}x${r(c.height)} r${r(c.radius)}`;
      case "diamond":
        return `diamond ${r(c.cx)},${r(c.cy)} ${r(c.width)}x${r(c.height)}`;
      case "stateStart":
        return `stateStart ${r(c.cx)},${r(c.cy)} r${r(c.radius)}`;
      case "stateEnd":
        return `stateEnd ${r(c.cx)},${r(c.cy)} r${r(c.radius)}`;
      case "stateBar":
        return `stateBar ${r(c.x)},${r(c.y)} ${r(c.width)}x${r(c.height)}`;
      case "polyline": {
        const m = (mk: (typeof c)["toMarker"]): string =>
          `l${mk.lines.length}p${mk.polygons.length}c${mk.circle === null ? 0 : 1}`;
        return `polyline ${c.points.map((p) => `${r(p.x)},${r(p.y)}`).join(" ")} dashed=${c.dashed} from=${m(c.fromMarker)} to=${m(c.toMarker)}`;
      }
      case "icon":
        return `icon ${c.ref.pack}/${c.ref.name} ${r(c.x)},${r(c.y)} ${r(c.size)}`;
      case "label":
        return `label "${c.text}" ${r(c.x)},${r(c.y)} ${c.align}`;
      case "wedge":
        return `wedge ${r(c.cx)},${r(c.cy)} r${r(c.radius)}/${r(c.innerRadius)} ${c.startAngle.toFixed(3)}..${c.endAngle.toFixed(3)} c${c.colorIndex}`;
    }
  });

describe("pipeline goldens", () => {
  for (const sample of SAMPLES) {
    it(`lays out ${sample.name} to a stable display list`, async () => {
      const parsed = parseDiagram(sample.text);
      expect(isOk(parsed)).toBe(true);
      if (!isOk(parsed)) return;
      const laid = await layoutDiagram(parsed.value, heuristicMeasure);
      expect(isOk(laid)).toBe(true);
      if (!isOk(laid)) return;
      expect(normalize(toDisplayList(laid.value))).toMatchSnapshot();
    });
  }
});

// The baseline for the (opt-in) energy-aware layout work: every default layout must satisfy the
// family-agnostic style invariants (no sibling overlaps, containers enclose members) — this locks
// today's styles in as the baseline, so a later layout change can't silently break a diagram type.
// It also records each example's energy (crossings/overlaps), giving us numbers for "we still get
// overlaps" before any change. Pure measurement — no behaviour change in this PR.
describe("layout energy baseline + style invariants", () => {
  for (const sample of SAMPLES) {
    it(`${sample.name}: satisfies the style invariants and has finite energy`, async () => {
      const parsed = parseDiagram(sample.text);
      if (!isOk(parsed)) return;
      const laid = await layoutDiagram(parsed.value, heuristicMeasure);
      if (!isOk(laid)) return;
      const e = layoutEnergy(laid.value);
      // Baseline guard: today's default layout keeps the family-agnostic style invariants.
      expect(noSiblingOverlaps(laid.value)).toBe(true);
      expect(containersEncloseMembers(laid.value)).toBe(true);
      expect(pieSlicesTileCircle(laid.value)).toBe(true); // vacuous off-pie; real on the pie example
      // Surface the numbers (crossings / edge-node hits) so the metric is visible in the run.
      console.log(
        `energy[${sample.name}] crossings=${e.crossings} edgeNodeHits=${e.edgeNodeHits} total=${e.total.toFixed(1)}`,
      );
      expect(Number.isFinite(e.total)).toBe(true);
    });
  }

  it("organic (ELK stress) lays a flowchart out validly and differently from layered", async () => {
    const parsed = parseDiagram("flowchart TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n");
    if (!isOk(parsed)) return;
    const layered = await layoutDiagram(parsed.value, heuristicMeasure, new Set(), false, false);
    const organic = await layoutDiagram(parsed.value, heuristicMeasure, new Set(), false, true);
    if (!isOk(layered) || !isOk(organic)) throw new Error("layout failed");
    // A real, in-bounds, non-overlapping placement…
    expect(organic.value.nodes).toHaveLength(4);
    expect(noSiblingOverlaps(organic.value)).toBe(true);
    // …that is genuinely a different (force-based) shape, not the layered one.
    const pos = (s: typeof organic.value) =>
      s.nodes.map((n) => `${Math.round(n.bounds.origin.x)},${Math.round(n.bounds.origin.y)}`).join(";");
    expect(pos(organic.value)).not.toEqual(pos(layered.value));
  });

  // "Tidy layout" must never make a layered family WORSE — the default config is always one of the
  // candidates, so the selected energy is ≤ the default's. (Often equal: ELK's default is already good.)
  const layeredSamples = SAMPLES.filter((s) =>
    ["flowchart", "state", "state-composite", "er", "class", "gitGraph"].includes(s.name),
  );
  for (const sample of layeredSamples) {
    it(`${sample.name}: tidy layout never raises the energy (≤ default)`, async () => {
      const parsed = parseDiagram(sample.text);
      if (!isOk(parsed)) return;
      const base = await layoutDiagram(parsed.value, heuristicMeasure, new Set(), false);
      const tidy = await layoutDiagram(parsed.value, heuristicMeasure, new Set(), true);
      if (!isOk(base) || !isOk(tidy)) return;
      expect(noSiblingOverlaps(tidy.value)).toBe(true); // still a valid, in-style layout
      expect(layoutEnergy(tidy.value).total).toBeLessThanOrEqual(layoutEnergy(base.value).total + 1e-6);
    });
  }
});
