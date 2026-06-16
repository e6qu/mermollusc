import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click a flowchart edge relabels its |label| in the source text", async ({ page }) => {
  page.on("dialog", (d) => d.accept("maybe"));

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // Two nodes stacked top-to-bottom; the labelled edge runs down the centre between them.
  await page.locator("#src").fill("flowchart TB\n  A[Top] -->|yes| B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // Mid-height, centre-x: on the edge between the two nodes.
  if (box !== null) await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator("#src")).toHaveValue(/-->\|maybe\|/);
});
