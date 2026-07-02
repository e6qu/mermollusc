import { expect, test, type Page } from "@playwright/test";
import { clickNode } from "./support/nodes.js";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The `S` key cycles the selected flowchart node's shape (rect → round → stadium → …), rewriting only
// that node's bracket syntax in the source and keeping its label.
test("S cycles the selected node's shape, rewriting its brackets in place", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "flowchart TB\n  A[Start] --> B[End]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await clickNode(page, "A"); // select A (top of the vertical chain)

  // rect → round
  await page.keyboard.press("s");
  await expectSourceMatches(page, /\n {2}A\(Start\) --> B\[End\]\n/);
  await expect(page.locator("#stage")).toBeFocused();

  // round → stadium (the label is preserved across the reshape; B is untouched). The app restores
  // the reshaped node selection after re-render, so the next keyboard command should keep working.
  await page.keyboard.press("s");
  await expectSourceMatches(page, /\n {2}A\(\[Start\]\) --> B\[End\]\n/);
});
