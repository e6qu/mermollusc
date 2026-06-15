import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the Sketch toggle re-renders hand-drawn and back without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#sketch")).toHaveText("Sketch");

  await page.locator("#sketch").click();
  await expect(page.locator("#sketch")).toHaveText("Crisp");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#sketch").click();
  await expect(page.locator("#sketch")).toHaveText("Sketch");

  expect(errors).toEqual([]);
});
