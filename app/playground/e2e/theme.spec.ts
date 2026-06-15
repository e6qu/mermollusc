import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const canvasBg = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).style.backgroundColor);

test("the theme toggle switches the canvas background and re-renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // Light theme: white surface; the toggle reads "Dark".
  await expect.poll(() => canvasBg(page)).toBe("rgb(255, 255, 255)");
  await expect(page.locator("#theme")).toHaveText("Dark");

  await page.locator("#theme").click();

  // Dark theme: slate surface; the toggle now reads "Light".
  await expect.poll(() => canvasBg(page)).toBe("rgb(15, 23, 42)");
  await expect(page.locator("#theme")).toHaveText("Light");

  await page.locator("#theme").click();
  await expect.poll(() => canvasBg(page)).toBe("rgb(255, 255, 255)");

  expect(errors).toEqual([]);
});
