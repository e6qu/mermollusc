import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Connect chains 3+ selected nodes in order: one edge per consecutive pair (A→B→C), built in a single
// action. Selecting all three loose nodes with ⌘A (which selects in source/node order) then Connect
// appends both `A --> B` and `B --> C`.
test("Connect chains three selected nodes into A→B→C", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "flowchart TB\n  A[Alpha]\n  B[Beta]\n  C[Gamma]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // focus the canvas (not the editor) so ⌘A selects nodes, then select all three
  await page.mouse.click(box.x + 8, box.y + 8);
  await page.keyboard.press("ControlOrMeta+a");

  await page.locator("#connect").click();

  // both consecutive edges were appended, in order
  await expectSourceMatches(page, /\n {2}A --> B\n/);
  await expectSourceMatches(page, /\n {2}B --> C\n/);
});
