import { edgesAvoidContainerHeaders, heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagram } from "@m/parser";
import { defaultTheme, toDisplayList, toSvg } from "@m/renderer";
import { isOk, isErr } from "@m/std";
import { describe, it } from "vitest";
import { EXAMPLES } from "../../src/examples.js";

describe("playground examples", () => {
  it("keeps network and cloud in the demo catalog", () => {
    if (!EXAMPLES.has("network")) throw new Error("missing network example");
    if (!EXAMPLES.has("cloud")) throw new Error("missing cloud example");
  });

  for (const [name, text] of EXAMPLES) {
    it(`renders the ${name} menu example through the shared pipeline`, async () => {
      const parsed = parseDiagram(text);
      if (!isOk(parsed)) throw new Error(parsed.error.errors.join("; "));
      const laid = await layoutDiagram(parsed.value, heuristicMeasure);
      if (isErr(laid)) throw new Error(laid.error.message);
      if (!edgesAvoidContainerHeaders(laid.value)) {
        throw new Error(`${name} routes an edge through a container title band`);
      }
      const cmds = toDisplayList(laid.value);
      if (cmds.length === 0) throw new Error(`${name} rendered an empty display list`);
      const svg = toSvg(cmds, {
        width: Math.ceil(laid.value.extent.size.width) + 16,
        height: Math.ceil(laid.value.extent.size.height) + 16,
        origin: laid.value.extent.origin,
        margin: 8,
        theme: defaultTheme,
        icons: new Map(),
      });
      if (!svg.startsWith("<svg")) throw new Error(`${name} did not export SVG`);
      if (svg.includes("NaN") || svg.includes("Infinity")) {
        throw new Error(`${name} exported non-finite SVG geometry`);
      }
    });
  }
});
