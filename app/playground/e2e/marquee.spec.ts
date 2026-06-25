import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("shift-drag box-selects the enclosed nodes (enabling Group)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await expect(page.locator("#group")).toBeDisabled(); // nothing selected yet

  // Shift-drag a box over the default flowchart's top two nodes (Start ~y56, Choice ~y150).
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + 30, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 185, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  // Two ungrouped nodes are now selected → Group enables.
  await expect(page.locator("#group")).toBeEnabled();

  // And they can be grouped as one unit.
  await page.locator("#group").click();
  await expect(page.locator("#ungroup")).toBeEnabled();

  expect(errors).toEqual([]);
});

test("plain drag on empty canvas (no Shift) area-selects, replacing the selection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;

  await expect(page.locator("#group")).toBeDisabled();

  // No modifier: a drag from empty canvas over the top two nodes rubber-bands a selection.
  await page.mouse.move(box.x + 30, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 185, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator("#group")).toBeEnabled(); // two nodes selected
  expect(errors).toEqual([]);
});

test("the hand tool still pans on an empty-canvas drag (marquee is select-tool only)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#tool-hand").click();
  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;
  // Dragging with the hand tool must not select anything (it pans).
  await page.mouse.move(box.x + 30, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 185, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#group")).toBeDisabled(); // nothing got selected
});

test("the area selector also catches edges (their source highlights with the nodes)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart LR\n  A[A] --> B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;
  // Drag a box over the whole diagram (both nodes + the edge between them).
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 10 });
  await page.mouse.up();
  // The edge connector token is highlighted in the source alongside the nodes.
  await expect.poll(() => page.evaluate(() => window.__editorHighlight?.() ?? "")).toMatch(/-->/);
});
