import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const labelPos = (page: Page, id: string) =>
  page.evaluate((e) => window.__edgeLabelPos?.(e) ?? null, id);
const firstLabelledEdge = (page: Page) =>
  page.evaluate(() => (window.__shownEdges?.() ?? []).find((edge) => edge.label !== null)?.id ?? null);

test("an edge label travels with the edge when an endpoint node is dragged", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[Top] -->|carry| B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await labelPos(page, "e0");
  expect(before).not.toBeNull();
  const aRect = await page.evaluate(() => window.__nodeRect?.("A") ?? null);
  if (before === null || aRect === null) return;

  // Drag node A far to the right — the edge re-routes, and its label must follow (not stay behind).
  const cx = aRect.x + aRect.w / 2;
  const cy = aRect.y + aRect.h / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 160, cy + 40, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await labelPos(page, "e0");
      return after === null ? 0 : Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(20); // the label moved meaningfully with the edge
});

test("a moved edge label keeps its relative position across an edge rerender", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[Left] -->|move me| B[Right]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await labelPos(page, "e0");
  expect(before).not.toBeNull();
  if (before === null) return;

  await page.evaluate(() => window.__setEdgeLabelT?.("e0", 0.85));

  await expect
    .poll(async () => {
      const pos = await labelPos(page, "e0");
      return pos === null ? 0 : pos.x - before.x;
    })
    .toBeGreaterThan(20);

  await page.keyboard.press("s");

  await expect
    .poll(async () => {
      const pos = await labelPos(page, "e0");
      return pos === null ? 0 : pos.x - before.x;
    })
    .toBeGreaterThan(20);
});

const labelledGraphCases: ReadonlyArray<readonly [string, string]> = [
  ["flowchart", "flowchart LR\n  A[Left] -->|approve| B[Right]\n"],
  ["sequence", "sequenceDiagram\n  participant A\n  participant B\n  A->>B: approve\n"],
  ["c4", 'C4Context\n  Person(a, "Agent")\n  System(s, "System")\n  Rel(a, s, "uses")\n'],
  ["block", 'block-beta\n  a["A"]\n  b["B"]\n  a -->|uses| b\n'],
  ["network", 'network\n  server a "A"\n  server b "B"\n  a -- b : "443"\n'],
  ["cloud", 'cloud\n  compute a "A"\n  database b "B"\n  a --> b : "SQL"\n'],
  ["state", "stateDiagram-v2\n  A --> B : submit\n"],
  ["er", "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n"],
  ["class", "classDiagram\n  A --> B : uses\n"],
  [
    "requirement",
    "requirementDiagram\n  requirement r1 {\n    id: 1\n    text: one\n  }\n  element e1 {\n    type: service\n  }\n  e1 - satisfies -> r1\n",
  ],
  ["dot", 'digraph G {\n  a -> b [label="uses"]\n}\n'],
];

for (const [name, source] of labelledGraphCases) {
  test(`edge labels can be dragged from the UI in ${name}`, async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
    await setSource(page, source);
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

    const edgeId = await firstLabelledEdge(page);
    expect(edgeId, name).not.toBeNull();
    if (edgeId === null) throw new Error(`${name} did not render a labelled edge`);
    const before = await labelPos(page, edgeId);
    expect(before, name).not.toBeNull();
    if (before === null) throw new Error(`${name} label had no screen position`);

    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + 56, before.y + 22, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const after = await labelPos(page, edgeId);
        return after === null ? 0 : Math.hypot(after.x - before.x, after.y - before.y);
      }, { message: name })
      .toBeGreaterThan(12);
  });
}
