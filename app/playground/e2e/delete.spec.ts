import { expect, test, type Page } from "@playwright/test";
import { expectSourceNotMatches, setSource, sourceValue } from "./support/source.js";

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

test("deleting a node that shares an edge line keeps the other nodes (no collateral loss)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // A and C are only referenced on B's edge lines — a line-based delete of B used to drop them too.
  await setSource(page, "flowchart TD\n  A[Start] --> B[Middle]\n  B --> C[End]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select B (navigator order is A, B, C) and delete it.
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("ArrowDown"); // → B
  await page.keyboard.press("Delete");

  await expect.poll(() => sourceValue(page)).not.toContain("Middle");
  // A and C survive, each re-declared with its label.
  await expect.poll(() => sourceValue(page)).toContain("Start");
  await expect.poll(() => sourceValue(page)).toContain("End");
});
