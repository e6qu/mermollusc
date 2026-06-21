import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click relabels a Gantt task and writes back to the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // One task: its bar sits past the left gutter (scene x≈96) on the first row (scene y≈22).
  await setSource(page, "gantt\n  dateFormat YYYY-MM-DD\n  Build :b, 2024-01-01, 5d\n");
  await expect(page.locator("#kind")).toHaveText("gantt");

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Centre of the bar: MARGIN(24) + gutter(96) + ~half a 5-day bar, first row.
  await page.mouse.dblclick(box.x + 160, box.y + 57);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Build core");
  await editor.press("Enter");

  await expectSourceMatches(page, /Build core :b, 2024-01-01, 5d/);
});
