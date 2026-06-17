import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click relabels a node and writes back to the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // Reduce to a single node so it occupies the whole canvas — the centre is a safe hit point.
  await page.locator("#src").fill("flowchart TD\n  A[Start]\n");
  await expect.poll(() => canvasWidth(page)).toBeLessThan(160);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Renamed");
  await editor.press("Enter");

  await expect(page.locator("#src")).toHaveValue(/A\[Renamed\]/);
});
