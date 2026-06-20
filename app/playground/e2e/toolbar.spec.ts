import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("drag then relax then regenerate runs without errors", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + 44);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + 80);
    await page.mouse.up();
  }

  await page.locator("#relax").click();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#regenerate").click();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(errors).toEqual([]);
});
