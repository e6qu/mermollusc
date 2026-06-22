import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The `S` key cycles the selected flowchart node's shape (rect → round → stadium → …), rewriting only
// that node's bracket syntax in the source and keeping its label.
test("S cycles the selected node's shape, rewriting its brackets in place", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "flowchart TB\n  A[Start] --> B[End]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  const cx = box.x + box.width / 2;
  await page.mouse.click(cx, box.y + 44); // select A (top of the vertical chain)

  // rect → round
  await page.keyboard.press("s");
  await expectSourceMatches(page, /\n {2}A\(Start\) --> B\[End\]\n/);
  await expect(page.locator("#stage")).toBeFocused();

  // round → stadium (the label is preserved across the reshape; B is untouched). The app restores
  // the reshaped node selection after re-render, so the next keyboard command should keep working.
  await page.keyboard.press("s");
  await expectSourceMatches(page, /\n {2}A\(\[Start\]\) --> B\[End\]\n/);
});
