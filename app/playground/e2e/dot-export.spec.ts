import { expect, test, type Page } from "@playwright/test";
import { openExportMenu } from "./support/menu.js";
import { setSource } from "./support/source.js";

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

test("warns instead of exporting an empty DOT for a marker-only family (pie)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, 'pie\n  title Fruit\n  "Apples" : 30\n  "Pears" : 20\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await openExportMenu(page);
  await page.locator("#export-dot").click();
  // A pie has no graph nodes — the export is refused with a warning, not a blank file + "ok".
  await expect(page.locator("#status")).toHaveAttribute("data-level", "warning");
  await expect(page.locator("#status")).toContainText(/no graph nodes/i);
});
