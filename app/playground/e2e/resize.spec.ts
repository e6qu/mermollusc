import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The size override persisted for the first overridden node (or null when none).
const overrideSize = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as {
      overrides?: ReadonlyArray<[string, { size: { width: number; height: number } | null }]>;
    };
    return parsed.overrides?.[0]?.[1]?.size ?? null;
  });

test("dragging a corner handle resizes the selected node (undoable)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const start = await page.evaluate(() => window.__nodeRect?.("A") ?? null);
  expect(start).not.toBeNull();
  if (start === null) return;

  await page.mouse.click(start.x + start.w / 2, start.y + start.h / 2);
  expect(await overrideSize(page)).toBeNull();

  await page.mouse.move(start.x + start.w, start.y + start.h);
  await page.mouse.down();
  await page.mouse.move(start.x + start.w + 120, start.y + start.h + 104, { steps: 10 });
  await page.mouse.up();

  const sized = await overrideSize(page);
  expect(sized).not.toBeNull();
  if (sized === null) return;
  expect(sized.width).toBeGreaterThan(100); // grew well past the ~54px auto width
  expect(sized.height).toBeGreaterThan(60);

  await page.keyboard.press("Control+z"); // resize is one undo step
  await expect.poll(() => overrideSize(page)).toBeNull();

  expect(errors).toEqual([]);
});
