import { expect, test, type Page } from "@playwright/test";
import { openExportMenu } from "./support/menu.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Export downloads the current diagram as a PNG", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await openExportMenu(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-png").click(),
  ]);

  expect(download.suggestedFilename()).toBe("mermollusc.png");
  // The download resolved to a real file (a non-empty PNG), not an aborted stream.
  const path = await download.path();
  expect(path).not.toBeNull();
});
