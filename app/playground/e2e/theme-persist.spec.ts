import { expect, test, type Page } from "@playwright/test";

test.use({ colorScheme: "dark" });

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const canvasBg = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).style.backgroundColor);

test("follows the OS prefers-color-scheme on first load (no stored choice)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await expect.poll(() => canvasBg(page)).toBe("rgb(15, 23, 42)");
  await expect(page.locator("#theme")).toHaveText("Light");
});

test("an explicit choice persists across reloads and overrides the OS preference", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // System prefers dark, but the user picks light…
  await page.locator("#theme").click();
  await expect.poll(() => canvasBg(page)).toBe("rgb(255, 255, 255)");

  // …and that choice survives a reload (localStorage wins over the OS preference).
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect.poll(() => canvasBg(page)).toBe("rgb(255, 255, 255)");
  await expect(page.locator("#theme")).toHaveText("Dark");
});
