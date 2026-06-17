import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the source text persists across a reload", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A fresh context starts on the sample; edit to something distinctive.
  const edited = "flowchart LR\n  X[Persisted] --> Y[Reloaded]\n";
  await page.locator("#src").fill(edited);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The textarea comes back with the edit, not the default sample.
  await expect(page.locator("#src")).toHaveValue(edited);
});

test("a fresh context (no stored source) starts on the sample flowchart", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#src")).toHaveValue(/^flowchart TD/);
});
