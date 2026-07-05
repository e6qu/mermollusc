import { test, expect, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
import { dragNodeBy, nodeRect } from "./support/nodes.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The toolbar Undo/Redo buttons mirror the keyboard history: disabled when there's nothing to undo/redo,
// enabled once an edit is made, and they actually restore/re-apply the diagram state.
test("toolbar Undo/Redo buttons reflect and drive history", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const undo = page.locator("#undo");
  const redo = page.locator("#redo");

  // Fresh load, nothing edited yet → both disabled.
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await setSource(page, "flowchart TD\n  A[Start] --> B[Next]\n  B --> C[End]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await nodeRect(page, "A");
  await dragNodeBy(page, "A", 80, 40);
  const moved = await nodeRect(page, "A");
  expect(Math.abs(moved.x - before.x)).toBeGreaterThan(20);

  // An edit was made → Undo enabled, Redo still disabled.
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();

  await undo.click();
  await expect.poll(async () => (await nodeRect(page, "A")).x).toBeCloseTo(before.x, -1);
  // After undo → Redo becomes available.
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect.poll(async () => (await nodeRect(page, "A")).x).toBeCloseTo(moved.x, -1);
  await expect(undo).toBeEnabled();
});
