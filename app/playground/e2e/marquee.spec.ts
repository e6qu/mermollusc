import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("shift-drag box-selects the enclosed nodes (enabling Group)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await expect(page.locator("#group")).toBeDisabled(); // nothing selected yet

  // Shift-drag a box over the default flowchart's top two nodes (Start ~y56, Choice ~y150).
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + 30, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 185, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  // Two ungrouped nodes are now selected → Group enables.
  await expect(page.locator("#group")).toBeEnabled();

  // And they can be grouped as one unit.
  await page.locator("#group").click();
  await expect(page.locator("#ungroup")).toBeEnabled();

  expect(errors).toEqual([]);
});
