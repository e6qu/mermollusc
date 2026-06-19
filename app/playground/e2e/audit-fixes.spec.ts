import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Backspace in the icon-filter input edits the field, not the diagram", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A --> B\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select everything, then edit the icon-picker filter — Backspace must not delete the selection.
  await page.locator("#stage").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.locator("#icons-toggle").click();
  const filter = page.locator("#icon-filter");
  await filter.click();
  await filter.fill("xyz");
  await filter.press("Backspace");

  // The source still has both nodes (nothing was deleted), and the field lost its last char.
  await expect(filter).toHaveValue("xy");
  await expect(page.locator("#status")).toContainText("2 nodes");
});

test("a missing icon does not grey out the (correctly rendered) canvas", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, 'network\n  server s "Box" icon "simpleicons/definitely-not-a-real-icon"\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The diagram rendered, so the stage is not marked stale (no grey-out), and the status is a warning
  // that still carries the node count — not an error.
  await expect(page.locator("#stage-wrap")).toHaveAttribute("data-stale", "false");
  await expect(page.locator("#status")).toContainText("icon(s) failed");
  await expect(page.locator("#status")).toContainText("node");
});
