import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("SVG downloads the current diagram as a vector SVG", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-svg").click(),
  ]);

  expect(download.suggestedFilename()).toBe("mermollusc.svg");
  const path = await download.path();
  expect(path).not.toBeNull();
});
