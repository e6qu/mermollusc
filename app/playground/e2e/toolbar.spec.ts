import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const overrideCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return 0;
    const parsed = JSON.parse(raw) as { overrides?: unknown[] };
    return parsed.overrides?.length ?? 0;
  });

const documentOverrideCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.__overrideCount?.() ?? -1);

test("drag then relax then regenerate runs without errors", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + 44);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + 80);
    await page.mouse.up();
  }

  await page.locator("#relax").click();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#regenerate").click();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(errors).toEqual([]);
});

test("Regenerate preserves pinned manual node overrides", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    await page.mouse.move(box.x + 88, box.y + 56);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 240, { steps: 8 });
    await page.mouse.up();
  }
  await expect.poll(() => overrideCount(page)).toBe(1);

  await page.locator("#regenerate").click();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await expect.poll(() => overrideCount(page)).toBe(1);
  expect(errors).toEqual([]);
});

test("Regenerate clears imported unpinned node overrides", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  const source = "flowchart TD\n  A[Start]\n  B[End]\n  A --> B\n";
  const overlay = JSON.stringify({
    overrides: [
      [
        "A",
        {
          position: { x: 260, y: 120 },
          size: null,
          pinned: false,
        },
      ],
    ],
    groups: [],
    edgeStyles: [],
    nodeStyles: [],
  });

  await page.goto(`/#src=${encodeURIComponent(source)}&overlay=${encodeURIComponent(overlay)}`);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#kind")).toHaveText("flowchart");
  await expect.poll(() => documentOverrideCount(page)).toBe(1);

  await page.locator("#regenerate").click();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await expect.poll(() => documentOverrideCount(page)).toBe(0);
  expect(errors).toEqual([]);
});
