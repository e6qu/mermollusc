import { expect, test, type Page } from "@playwright/test";

test.use({ deviceScaleFactor: 2 });

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("backs the canvas at device resolution while keeping the CSS box size", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const { backingWidth, cssWidth } = await page.locator("#stage").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return { backingWidth: c.width, cssWidth: Number.parseInt(c.style.width, 10) };
  });

  // At deviceScaleFactor 2 the backing store is twice the on-screen CSS width.
  expect(backingWidth).toBe(cssWidth * 2);
});
