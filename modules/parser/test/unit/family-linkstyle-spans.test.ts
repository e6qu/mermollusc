import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseStateWithSource } from "../../src/shell/state-parse.js";
import { parseErWithSource } from "../../src/shell/er-parse.js";
import { parseBlockWithSource } from "../../src/shell/block-parse.js";
import { parseNetworkWithSource } from "../../src/shell/net-parse.js";
import { parseCloudWithSource } from "../../src/shell/cloud-parse.js";
import { parseClassWithSource } from "../../src/shell/class-parse.js";

// Each edge-bearing family captures the span of a single-index `linkStyle <n>` line (write-side), so the
// editor can rewrite/remove that edge's colour in place.
const cases: [string, (t: string) => unknown, string][] = [
  ["state", parseStateWithSource, "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n  linkStyle 0 stroke:#f00\n"],
  ["er", parseErWithSource, "erDiagram\n  A ||--o{ B : has\n  linkStyle 0 stroke:#f00\n"],
  ["block", parseBlockWithSource, "block-beta\n  A B\n  A --> B\n  linkStyle 0 stroke:#f00\n"],
  ["network", parseNetworkWithSource, "network\n  server a\n  host b\n  a -- b\n  linkStyle 0 stroke:#f00\n"],
  ["cloud", parseCloudWithSource, "cloud\n  compute a\n  storage b\n  a --> b\n  linkStyle 0 stroke:#f00\n"],
  ["class", parseClassWithSource, "classDiagram\n  A --> B\n  linkStyle 0 stroke:#f00\n"],
];

describe("write-side linkStyleSpans per family", () => {
  for (const [name, parse, src] of cases) {
    it(`${name}: captures the single-index linkStyle span`, () => {
      const r = parse(src) as ReturnType<typeof parseStateWithSource>;
      expect(isOk(r)).toBe(true);
      if (!isOk(r)) throw new Error("parse failed");
      const span = (r.value.source as { linkStyleSpans: ReadonlyMap<number, { start: number; end: number }> }).linkStyleSpans.get(0);
      expect(span).toBeDefined();
      if (span === undefined) throw new Error("no span");
      expect(src.slice(span.start, span.end)).toBe("linkStyle 0 stroke:#f00");
    });
  }
});
