import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click relabels a cloud service leaf and writes back to the source text", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // One group with one leaf: the leaf sits at a fixed inset (padding + group header) from the origin.
  await setSource(page, 'cloud\n  group "AWS" {\n    compute web "Web"\n  }\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.dblclick(box.x + 80, box.y + 78);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Renamed");
  await editor.press("Enter");

  await expectSourceMatches(page, /compute web "Renamed"/);
});
