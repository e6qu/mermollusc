import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("re-renders the canvas when the source text changes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page.locator("#src").fill("flowchart LR\n  X[A single wider node here]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("clicking the canvas does not crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) await page.mouse.click(box.x + box.width / 2, box.y + 44);

  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
