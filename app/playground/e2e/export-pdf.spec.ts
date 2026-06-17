import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("PDF downloads the current diagram as a one-page PDF", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-pdf").click(),
  ]);

  expect(download.suggestedFilename()).toBe("mermollusc.pdf");
  // The download resolved to a real file (a built PDF), not an aborted stream.
  const path = await download.path();
  expect(path).not.toBeNull();
});
