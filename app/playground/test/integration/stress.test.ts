import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagram } from "@m/parser";
import { toDisplayList } from "@m/renderer";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";

// Big-graph stress / linearity guard for the pure pipeline (parse → layout → display list). These use
// the pure grid layouts (network, block — no ELK), so they're synchronous-fast and deterministic. The
// point isn't a wall-clock budget (flaky in CI) but a regression net: every stage is O(n) today, so a
// few thousand nodes finishes in well under vitest's timeout; an accidental O(n²) (a `.find` in a
// per-node loop, say) would blow that timeout and a crash/throw would fail outright.
const N = 3000;
const STRESS_TIMEOUT_MS = 30_000;

const networkSource = (n: number): string => {
  const lines = ["network"];
  for (let i = 0; i < n; i++) lines.push(`  server s${i} "Server ${i}"`);
  for (let i = 0; i + 1 < n; i++) lines.push(`  s${i} -- s${i + 1}`);
  return `${lines.join("\n")}\n`;
};

const blockSource = (n: number): string => {
  const lines = ["block-beta", "  columns 6"];
  for (let i = 0; i < n; i++) lines.push(`  b${i}["Block ${i}"]`);
  return `${lines.join("\n")}\n`;
};

describe("large-diagram pipeline (stress)", () => {
  it(`renders a ${N}-node network end to end without crashing or stalling`, async () => {
    const parsed = parseDiagram(networkSource(N));
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    const laid = await layoutDiagram(parsed.value, heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;
    expect(laid.value.nodes).toHaveLength(N);
    expect(laid.value.edges).toHaveLength(N - 1);

    // The display list carries at least one command per node + edge; finite coordinates throughout.
    const cmds = toDisplayList(laid.value);
    expect(cmds.length).toBeGreaterThanOrEqual(N);
    expect(cmds.every((c) => Object.values(c).every((v) => typeof v !== "number" || Number.isFinite(v)))).toBe(true);
  }, STRESS_TIMEOUT_MS);

  it(`renders a ${N}-block grid end to end without crashing or stalling`, async () => {
    const parsed = parseDiagram(blockSource(N));
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    const laid = await layoutDiagram(parsed.value, heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;
    expect(laid.value.nodes).toHaveLength(N);

    const cmds = toDisplayList(laid.value);
    expect(cmds.length).toBeGreaterThanOrEqual(N);
  }, STRESS_TIMEOUT_MS);
});
