import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the icon picker filters and inserts an icon override at the caret", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A network node line; place the caret at its end so the inserted override lands on that line.
  await page.locator("#src").fill('network\n  server web "Web"');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#icons-toggle").click();
  const picker = page.locator("#icon-picker");
  await expect(picker).toBeVisible();

  await page.locator("#icon-filter").fill("docker");
  const first = page.locator("#icon-grid .picker-icon").first();
  await expect(first).toBeVisible();
  await first.click();

  // An `icon "<pack>/docker"` override was inserted into the source.
  await expect(page.locator("#src")).toHaveValue(/icon "[^"]+\/docker"/);

  await page.locator("#icons-close").click();
  await expect(picker).toBeHidden();
});

test("the icon filter reports when nothing matches", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page.locator("#icons-toggle").click();
  await page.locator("#icon-filter").fill("zzz-no-such-icon");
  await expect(page.locator("#icon-grid .picker-empty")).toBeVisible();
});
