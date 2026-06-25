import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const overrides = (page: Page) => page.evaluate(() => window.__overrideCount?.() ?? -1);

test("Reset positions clears manual drags and returns the diagram to its default layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  expect(await overrides(page)).toBe(0);

  // Drag the top "Start" node well to the side — an override appears.
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 120, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => overrides(page)).toBeGreaterThan(0);

  // The button returns it to the default layout (overrides cleared).
  await page.locator("#reset-positions").click();
  await expect.poll(() => overrides(page)).toBe(0);
  await expect(page.locator("#status")).toContainText(/default positions/i);
});

test("the __resetPositions API hook clears positions from script", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 90, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => overrides(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__resetPositions?.());
  await expect.poll(() => overrides(page)).toBe(0);
});
