import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click relabels a cloud service leaf and writes back to the source text", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept("Renamed"));

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // One group with one leaf: the leaf sits at a fixed inset (padding + group header) from the origin.
  await page.locator("#src").fill('cloud\n  group "AWS" {\n    compute web "Web"\n  }\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) await page.mouse.dblclick(box.x + 80, box.y + 78);

  await expect(page.locator("#src")).toHaveValue(/compute web "Renamed"/);
});
