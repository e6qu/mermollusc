import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const labelPos = (page: Page, id: string) =>
  page.evaluate((e) => window.__edgeLabelPos?.(e) ?? null, id);

test("an edge label travels with the edge when an endpoint node is dragged", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[Top] -->|carry| B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await labelPos(page, "e0");
  expect(before).not.toBeNull();
  const aRect = await page.evaluate(() => window.__nodeRect?.("A") ?? null);
  if (before === null || aRect === null) return;

  // Drag node A far to the right — the edge re-routes, and its label must follow (not stay behind).
  const cx = aRect.x + aRect.w / 2;
  const cy = aRect.y + aRect.h / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 160, cy + 40, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await labelPos(page, "e0");
      return after === null ? 0 : Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(20); // the label moved meaningfully with the edge
});

test("a moved edge label keeps its relative position across an edge rerender", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[Left] -->|move me| B[Right]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await labelPos(page, "e0");
  expect(before).not.toBeNull();
  if (before === null) return;

  await page.evaluate(() => window.__setEdgeLabelT?.("e0", 0.85));

  await expect
    .poll(async () => {
      const pos = await labelPos(page, "e0");
      return pos === null ? 0 : pos.x - before.x;
    })
    .toBeGreaterThan(20);

  await page.keyboard.press("s");

  await expect
    .poll(async () => {
      const pos = await labelPos(page, "e0");
      return pos === null ? 0 : pos.x - before.x;
    })
    .toBeGreaterThan(20);
});
