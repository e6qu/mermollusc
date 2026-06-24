import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click relabels a network node and writes back to the source text", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A single node sits at the scene origin, so a point just inside the top-left is a safe hit.
  await setSource(page, 'network\n  server web "Web"\n');
  await expect.poll(() => canvasWidth(page)).toBeLessThan(160);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.dblclick(box.x + 40, box.y + 44);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Renamed");
  await editor.press("Enter");

  await expectSourceMatches(page, /server web "Renamed"/);
});

test("double-click relabels a bare (label-less) network node by wrapping its id", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A bare node has no quoted label; relabel must add one rather than silently no-op.
  await setSource(page, "network\n  server web\n");
  await expect.poll(() => canvasWidth(page)).toBeLessThan(160);

  const box = await canvas.boundingBox();
  if (box === null) return;
  await page.mouse.dblclick(box.x + 40, box.y + 44);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Web Host");
  await editor.press("Enter");

  await expectSourceMatches(page, /server web "Web Host"/);
});
