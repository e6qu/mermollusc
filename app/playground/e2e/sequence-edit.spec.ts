import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click a sequence actor relabels it in the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page.locator("#src").fill("sequenceDiagram\n  participant A as Alice\n  A->>B: hi\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // First actor box sits at the origin; its centre is a deterministic hit point.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.dblclick(box.x + 56, box.y + 44);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Renamed");
  await editor.press("Enter");

  await expect(page.locator("#src")).toHaveValue(/as Renamed/);
});
