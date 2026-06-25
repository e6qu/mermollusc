import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// A gantt with explicit dates and no weekend exclusions, so px↔days is exact (DAY_WIDTH = 16).
const GANTT = "gantt\n  dateFormat YYYY-MM-DD\n  section S\n  Build : a, 2014-01-06, 4d\n";

test("dragging a gantt bar rewrites its start date in the source", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, GANTT);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(await sourceValue(page)).toContain("2014-01-06");

  const rect = await page.evaluate(() => window.__nodeRect?.("a") ?? null);
  expect(rect).not.toBeNull();
  if (rect === null) return;
  // Drag the bar to the right — the start date moves forward (exact day count depends on zoom/scroll,
  // so assert direction + a valid reschedule, not an exact pixel→day mapping).
  const cy = rect.y + rect.h / 2;
  await page.mouse.move(rect.x + rect.w / 2, cy);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.w / 2 + 16 * 3, cy, { steps: 6 });
  await page.mouse.up();

  await expect.poll(() => sourceValue(page)).not.toContain("2014-01-06");
  const after = await sourceValue(page);
  const m = /Build : a, (\d{4}-\d{2}-\d{2}), \d+d/.exec(after);
  expect(m).not.toBeNull();
  if (m !== null)
    expect(new Date(m[1] ?? "").getTime()).toBeGreaterThan(new Date("2014-01-06").getTime());
  await expect(page.locator("#status")).not.toHaveAttribute("data-level", "error");
});

test("resizing a gantt bar rewrites its duration in the source", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, GANTT);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(await sourceValue(page)).toContain(", 4d");

  const rect = await page.evaluate(() => window.__nodeRect?.("a") ?? null);
  if (rect === null) return;
  // Select the bar (resize handles only appear on the selected node), then drag its bottom-right corner.
  await page.mouse.click(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await page.mouse.move(rect.x + rect.w, rect.y + rect.h);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.w + 16 * 3, rect.y + rect.h, { steps: 6 });
  await page.mouse.up();

  // Duration grew beyond the original 4 days and the source still parses.
  await expect.poll(() => sourceValue(page)).not.toMatch(/, 4d/);
  const after = await sourceValue(page);
  const m = /Build : a, \d{4}-\d{2}-\d{2}, (\d+)d/.exec(after);
  expect(m).not.toBeNull();
  if (m !== null) expect(Number(m[1])).toBeGreaterThan(4);
  await expect(page.locator("#status")).not.toHaveAttribute("data-level", "error");
});
