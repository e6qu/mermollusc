import {
  cardinalMountViolations,
  edgesAvoidContainerHeaders,
  heuristicMeasure,
  layoutDiagram,
  respreadPorts,
  trunkRoutes,
} from "@m/layout";
import type { Scene } from "@m/contracts";
import { parseDiagram } from "@m/parser";
import { defaultTheme, toDisplayList, toSvg } from "@m/renderer";
import { isOk, isErr } from "@m/std";
import { describe, it } from "vitest";
import { EXAMPLES } from "../../src/examples.js";

const MOUNT_POINT_EXAMPLES = new Set([
  "flowchart",
  "c4",
  "block",
  "network",
  "cloud",
  "state",
  "er",
  "class",
  "requirement",
]);

const BOX_ROUTED_EXAMPLES = new Set(["c4", "block", "network", "cloud"]);

const assertCardinalMounts = (name: string, variant: string, scene: Scene): void => {
  const violations = cardinalMountViolations(scene);
  if (violations.length === 0) return;
  throw new Error(
    `${name} ${variant} has off-mount edge endpoints: ${violations
      .map((v) => `${v.edgeId}:${v.end}:${v.nodeId}@${v.endpoint.x},${v.endpoint.y}`)
      .join("; ")}`,
  );
};

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
      if (MOUNT_POINT_EXAMPLES.has(name)) {
        assertCardinalMounts(name, "layout", laid.value);
        if (BOX_ROUTED_EXAMPLES.has(name)) {
          assertCardinalMounts(name, "bus", respreadPorts(laid.value, true));
          assertCardinalMounts(name, "trunk", trunkRoutes(laid.value));
        }
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
