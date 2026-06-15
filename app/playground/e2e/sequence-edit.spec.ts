import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click a sequence actor relabels it in the source text", async ({ page }) => {
  page.on("dialog", (d) => d.accept("Renamed"));

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page.locator("#src").fill("sequenceDiagram\n  participant A as Alice\n  A->>B: hi\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // First actor box sits at the origin; its centre is a deterministic hit point.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) await page.mouse.dblclick(box.x + 56, box.y + 44);

  await expect(page.locator("#src")).toHaveValue(/as Renamed/);
});
