import { expect, test, type Page } from "@playwright/test";
import { openExportMenu } from "./support/menu.js";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The Reset control clears the app's persisted state (source/overlay/theme) and reloads a fresh demo
// on the sample diagram.
test("Reset clears saved state and reloads the sample", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await setSource(page, "flowchart TD\n  Mine[my work]\n");
  await expect.poll(() => sourceValue(page)).toContain("my work");

  page.once("dialog", (d) => void d.accept());
  await openExportMenu(page);
  await page.locator("#reset-cache").click();

  // The page reloads to the clean URL; the persisted source is gone, so it comes back on the sample.
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => sourceValue(page)).toContain("A[Start]");
  expect(await sourceValue(page)).not.toContain("my work");
});

// Cancelling the confirm keeps the current work.
test("Reset cancelled keeps the current diagram", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  Keep[keep me]\n");
  await expect.poll(() => sourceValue(page)).toContain("keep me");

  page.once("dialog", (d) => void d.dismiss());
  await openExportMenu(page);
  await page.locator("#reset-cache").click();
  await page.waitForTimeout(150);
  expect(await sourceValue(page)).toContain("keep me");
});
