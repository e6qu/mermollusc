import { expect, test, type Page } from "@playwright/test";
import { dragNodeBy } from "./support/nodes.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const overrides = (page: Page) => page.evaluate(() => window.__overrideCount?.() ?? -1);

test("Reset positions clears manual drags and returns the diagram to its default layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  expect(await overrides(page)).toBe(0);

  // Drag the top "Start" node (A) well to the side — an override appears.
  await dragNodeBy(page, "A", 172, 64);
  await expect.poll(() => overrides(page)).toBeGreaterThan(0);

  // The button returns it to the default layout (overrides cleared).
  await page.locator("#reset-positions").click();
  await expect.poll(() => overrides(page)).toBe(0);
  await expect(page.locator("#status")).toContainText(/default positions/i);
});

test("the __resetPositions API hook clears positions from script", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await dragNodeBy(page, "A", 152, 34);
  await expect.poll(() => overrides(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__resetPositions?.());
  await expect.poll(() => overrides(page)).toBe(0);
});
