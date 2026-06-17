import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click a flowchart edge relabels its |label| in the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // Two nodes stacked top-to-bottom; the labelled edge runs down the centre between them.
  await page.locator("#src").fill("flowchart TB\n  A[Top] -->|yes| B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Mid-height, centre-x: on the edge between the two nodes.
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("maybe");
  await editor.press("Enter");

  await expect(page.locator("#src")).toHaveValue(/-->\|maybe\|/);
});
