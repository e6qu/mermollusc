import { expect, test, type Page } from "@playwright/test";
import { expectSourceNotMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Delete key removes the selected node from the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "flowchart TB\n  A[Alpha] --> B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // Select the bottom node (B), then press Delete; the line that references it is removed.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 44);
  await page.keyboard.press("Delete");

  await expectSourceNotMatches(page, /Beta/);
});
