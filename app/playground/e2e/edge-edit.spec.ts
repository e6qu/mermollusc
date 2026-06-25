import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// A TB flowchart stacks the two nodes; the edge runs down the centre, so mid-canvas hits it.
const setBareEdge = async (page: Page) => {
  await setSource(page, "flowchart TB\n  A[Top] --> B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

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
  await setBareEdge(page);

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  // Single click on the edge selects it; S then cycles arrow → open.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("s");
  await expectSourceMatches(page, /A\[Top\] --- B\[Bottom\]/);

  // Pressing S again advances open → dotted.
  await page.keyboard.press("s");
  await expectSourceMatches(page, /A\[Top\] -\.-> B\[Bottom\]/);
});
