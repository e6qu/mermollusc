import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
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
  const src = await page.locator("#src").inputValue();

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Grab the top "Start" node and drag it well to the right.
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 56, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(before);
  // A geometry drag never edits the text.
  expect(await page.locator("#src").inputValue()).toBe(src);
  expect(errors).toEqual([]);
});

test("a shift-selected pair drags together (both move, source untouched)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const before = await canvasWidth(page);
  const src = await page.locator("#src").inputValue();

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + 88, box.y + 56); // Start
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 88, box.y + 150); // + Choice
  await page.keyboard.up("Shift");
  // Drag the pair to the right; both move, so the sheet grows.
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 120, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(before);
  expect(await page.locator("#src").inputValue()).toBe(src);
  expect(errors).toEqual([]);
});
