import { heuristicMeasure, layoutDiagram } from "@m/layout";
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
];

const r = (n: number): number => Math.round(n);

const normalize = (cmds: ReturnType<typeof toDisplayList>): string[] =>
  cmds.map((c) => {
    switch (c.kind) {
      case "box":
        return `box ${r(c.x)},${r(c.y)} ${r(c.width)}x${r(c.height)} r${r(c.radius)}`;
      case "diamond":
        return `diamond ${r(c.cx)},${r(c.cy)} ${r(c.width)}x${r(c.height)}`;
      case "polyline": {
        const m = (mk: (typeof c)["toMarker"]): string =>
          `l${mk.lines.length}t${mk.triangle === null ? 0 : 1}c${mk.circle === null ? 0 : 1}`;
        return `polyline ${c.points.map((p) => `${r(p.x)},${r(p.y)}`).join(" ")} dashed=${c.dashed} from=${m(c.fromMarker)} to=${m(c.toMarker)}`;
      }
      case "icon":
        return `icon ${c.ref.pack}/${c.ref.name} ${r(c.x)},${r(c.y)} ${r(c.size)}`;
      case "label":
        return `label "${c.text}" ${r(c.x)},${r(c.y)} ${c.align}`;
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
