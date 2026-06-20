import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const snapActive = (page: Page) => page.evaluate(() => window.__snapActive?.() ?? false);

declare global {
  interface Window {
    __snapActive?: () => boolean;
  }
}

// Dragging a single node snaps its edges/centre to other nodes' alignment lines (with a guide). In the
// default top-down flowchart the nodes share a spine centre-x, so a few-pixel horizontal drag snaps
// back to it; a large drag lands off any alignment and doesn't snap.
test("a single-node drag snaps to an alignment line, and releases the snap when far off", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // grab the Start node and nudge it 3px right — within the snap threshold of the shared spine centre
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 91, box.y + 56, { steps: 3 });
  expect(await snapActive(page)).toBe(true);

  // drag well clear of any alignment → no snap
  await page.mouse.move(box.x + 240, box.y + 56, { steps: 4 });
  expect(await snapActive(page)).toBe(false);

  await page.mouse.up();
  // the guide is cleared once the drag ends
  expect(await snapActive(page)).toBe(false);
  expect(errors).toEqual([]);
});

// Resizing reuses the same alignment machinery: the moving corner snaps to other nodes' edge/centre
// lines. In the default flowchart the stacked nodes share a width, so Start's right edge lines up with
// theirs — nudging the bottom-right corner a few pixels re-snaps to that line; a big drag lands clear.
test("a corner-handle resize snaps the moving corner to an alignment line", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // select Start, then grab its bottom-right corner handle (~111, 76)
  await page.mouse.click(box.x + 88, box.y + 56);
  await page.mouse.move(box.x + 111, box.y + 76);
  await page.mouse.down();

  // nudge the corner a few px past the shared right-edge line → snaps back to it
  await page.mouse.move(box.x + 114, box.y + 78, { steps: 3 });
  expect(await snapActive(page)).toBe(true);

  // drag the corner well clear of every alignment line → no snap
  await page.mouse.move(box.x + 240, box.y + 56, { steps: 6 });
  expect(await snapActive(page)).toBe(false);

  await page.mouse.up();
  expect(await snapActive(page)).toBe(false);
  expect(errors).toEqual([]);
});
