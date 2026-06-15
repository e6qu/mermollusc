import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click relabels a network node and writes back to the source text", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept("Renamed"));

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A single node sits at the scene origin, so a point just inside the top-left is a safe hit.
  await page.locator("#src").fill('network\n  server web "Web"\n');
  await expect.poll(() => canvasWidth(page)).toBeLessThan(160);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) await page.mouse.dblclick(box.x + 40, box.y + 44);

  await expect(page.locator("#src")).toHaveValue(/server web "Renamed"/);
});
