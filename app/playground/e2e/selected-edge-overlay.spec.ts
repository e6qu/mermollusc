import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const labelPos = (page: Page, id: string) =>
  page.evaluate((e) => window.__edgeLabelPos?.(e) ?? null, id);

const canvasPixel = (
  page: Page,
  p: { readonly x: number; readonly y: number },
): Promise<readonly [number, number, number, number]> =>
  page.locator("#stage").evaluate(
    (canvas, point) => {
      const c = canvas as HTMLCanvasElement;
      const rect = c.getBoundingClientRect();
      const sx = c.width / rect.width;
      const sy = c.height / rect.height;
      const ctx = c.getContext("2d");
      if (ctx === null) throw new Error("missing 2d context");
      const x = Math.round((point.x - rect.left) * sx);
      const y = Math.round((point.y - rect.top) * sy);
      const data = ctx.getImageData(x, y, 1, 1).data;
      return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0] as const;
    },
    p,
  );

test("selecting an edge paints the route halo label-anchor handle", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[Left] -->|selected| B[Right]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const pos = await labelPos(page, "e0");
  expect(pos).not.toBeNull();
  if (pos === null) throw new Error("missing edge label position");

  await page.mouse.click(pos.x, pos.y);
  await expect(page.locator("#context-bar")).toBeVisible();
  await expect(page.locator("#ctx-curve")).toBeVisible();

  const [r, g, b, a] = await canvasPixel(page, pos);
  expect(a).toBe(255);
  expect(r).toBeGreaterThan(20);
  expect(r).toBeLessThan(70);
  expect(g).toBeGreaterThan(70);
  expect(g).toBeLessThan(130);
  expect(b).toBeGreaterThan(180);
});
