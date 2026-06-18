import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click relabels a C4 element and writes back to the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A single element sits at the scene origin, so a point just inside the top-left is a safe hit.
  await setSource(page, 'C4Context\n  Person(user, "Customer")\n');
  await expect.poll(() => canvasWidth(page)).toBeLessThan(160);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.dblclick(box.x + 60, box.y + 50);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Renamed");
  await editor.press("Enter");

  await expectSourceMatches(page, /Person\(user, "Renamed"\)/);
});
