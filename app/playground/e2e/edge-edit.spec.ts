import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// A TB flowchart stacks the two nodes; the edge runs down the centre, so mid-canvas hits it.
const setBareEdge = async (page: Page) => {
  await setSource(page, "flowchart TB\n  A[Top] --> B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

test("double-clicking an edge's LABEL (offset from the line) renames the edge", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[Top] -->|old| B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The label is drawn offset from the edge line (beyond the line's hit tolerance). Double-clicking it
  // must still select the edge and open its editor — the regression this fixes.
  const pos = await page.evaluate(() => window.__edgeLabelPos?.("e0") ?? null);
  expect(pos).not.toBeNull();
  if (pos === null) return;
  await page.mouse.dblclick(pos.x, pos.y);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("old"); // opened on the edge label, not a node
  await editor.fill("renamed");
  await editor.press("Enter");
  await expectSourceMatches(page, /-->\|renamed\|/);
});

test("double-clicking a BARE flowchart edge adds a |label| to it", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setBareEdge(page);

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("ready");
  await editor.press("Enter");

  await expectSourceMatches(page, /-->\|ready\|/);
});

test("selecting an edge and pressing S cycles its arrow style", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // A labelled edge gives a deterministic click target (its label position).
  await setSource(page, "flowchart TB\n  A[Top] -->|go| B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const pos = await page.evaluate(() => window.__edgeLabelPos?.("e0") ?? null);
  expect(pos).not.toBeNull();
  if (pos === null) return;
  // Single click on the edge label selects the edge; S then cycles arrow → open.
  await page.mouse.click(pos.x, pos.y);
  await page.keyboard.press("s");
  await expectSourceMatches(page, /A\[Top\] ---\|go\| B\[Bottom\]/);

  // Pressing S again advances open → dotted (the label survives the restyle).
  await page.keyboard.press("s");
  await expectSourceMatches(page, /A\[Top\] -\.->\|go\| B\[Bottom\]/);
});

test("selecting a sequence message and pressing S cycles its message arrow", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "sequenceDiagram\n  A->>B: approve\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const pos = await page.evaluate(() => window.__edgeLabelPos?.("m0") ?? null);
  expect(pos).not.toBeNull();
  if (pos === null) return;
  await page.mouse.click(pos.x, pos.y);

  await page.keyboard.press("s");
  await expectSourceMatches(page, /A-->>B: approve/);

  await page.keyboard.press("s");
  await expectSourceMatches(page, /A->B: approve/);

  await page.keyboard.press("s");
  await expectSourceMatches(page, /A-->B: approve/);
});
