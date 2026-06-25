import { expect, test, type Page } from "@playwright/test";
import { openExportMenu } from "./support/menu.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("exports the current diagram as a Graphviz DOT file", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await openExportMenu(page);

  // The button triggers a download; the .dot content itself is covered by the toDot unit + round-trip
  // tests, so here we just confirm the export fires with the right filename.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-dot").click(),
  ]);
  expect(download.suggestedFilename()).toBe("mermollusc.dot");
  await expect(page.locator("#status")).toContainText("mermollusc.dot");
});
