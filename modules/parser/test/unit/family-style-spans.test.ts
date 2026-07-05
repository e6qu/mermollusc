import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseErWithSource } from "../../src/shell/er-parse.js";
import { parseBlockWithSource } from "../../src/shell/block-parse.js";
import { parseNetworkWithSource } from "../../src/shell/net-parse.js";
import { parseCloudWithSource } from "../../src/shell/cloud-parse.js";
import { parseClassWithSource } from "../../src/shell/class-parse.js";

// Each family captures the span of a single-target `style <id>` line (write-side), so the editor can
// rewrite/remove that node's colour in place. A multi-target line is not captured.
const cases: [string, (t: string) => unknown, string, string, string][] = [
  ["er", parseErWithSource, "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  style CUSTOMER fill:#f96\n", "CUSTOMER", "style CUSTOMER fill:#f96"],
  ["block", parseBlockWithSource, "block-beta\n  A B\n  style A fill:#f96\n", "A", "style A fill:#f96"],
  ["network", parseNetworkWithSource, "network\n  server a\n  host b\n  a -- b\n  style a fill:#f96\n", "a", "style a fill:#f96"],
  ["cloud", parseCloudWithSource, "cloud\n  compute a\n  storage b\n  a --> b\n  style a fill:#f96\n", "a", "style a fill:#f96"],
  ["class", parseClassWithSource, "classDiagram\n  class Animal\n  style Animal fill:#f96\n", "Animal", "style Animal fill:#f96"],
];

describe("write-side styleSpans per family", () => {
  for (const [name, parse, src, id, expected] of cases) {
    it(`${name}: captures the single-target style span`, () => {
      const r = parse(src) as ReturnType<typeof parseErWithSource>;
      expect(isOk(r)).toBe(true);
      if (!isOk(r)) throw new Error("parse failed");
      const span = (r.value.source as { styleSpans: ReadonlyMap<string, { start: number; end: number }> }).styleSpans.get(id);
      expect(span).toBeDefined();
      if (span === undefined) throw new Error("no span");
      expect(src.slice(span.start, span.end)).toBe(expected);
    });
  }
});
