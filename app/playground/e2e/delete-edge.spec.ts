import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("selecting an edge and pressing Delete removes it from the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // Declarations on their own lines, edge on a standalone line — so deleting the edge spares them.
  await page.locator("#src").fill("flowchart TB\n  A[Top]\n  B[Bottom]\n  A --> B\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Click the edge (centre gap between the stacked nodes), then Delete.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Delete");

  await expect(page.locator("#src")).not.toHaveValue(/-->/);
  // Node declarations survive.
  await expect(page.locator("#src")).toHaveValue(/A\[Top\]/);
});
