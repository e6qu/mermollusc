import { expect, test, type Page } from "@playwright/test";
import { clickNode, dragNodeBy, nodeCenter } from "./support/nodes.js";
import { sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Dragging a node beyond the original layout bounds grows the sheet (so it isn't clipped) — an
// observable proxy that the drag actually moved the node and applyOverrides widened the extent.
test("dragging a node past the bounds grows the sheet and keeps the source unchanged", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const before = await canvasWidth(page);
  const src = await sourceValue(page);

  // Grab the "Start" node (A) and drag it well to the right.
  await dragNodeBy(page, "A", 340, 0);

  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(before);
  // A geometry drag never edits the text.
  expect(await sourceValue(page)).toBe(src);
  expect(errors).toEqual([]);
});

test("a shift-selected pair drags together (both move, source untouched)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const before = await canvasWidth(page);
  const src = await sourceValue(page);

  await clickNode(page, "A"); // Start
  await page.keyboard.down("Shift");
  await clickNode(page, "B"); // + Authorized?
  await page.keyboard.up("Shift");
  // Drag the pair to the right; both move, so the sheet grows.
  const a = await nodeCenter(page, "A");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 340, a.y + 60, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(before);
  expect(await sourceValue(page)).toBe(src);
  expect(errors).toEqual([]);
});
