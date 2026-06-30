import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

interface IconPaintStats {
  readonly changedPixels: number;
  readonly sampledPixels: number;
}

const iconPaintStats = (page: Page, nodeId: string): Promise<IconPaintStats | null> =>
  page.evaluate((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>("#stage");
    const rect = window.__nodeRect?.(id) ?? null;
    if (canvas === null || rect === null) return null;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const cssToPixelX = (x: number): number => Math.round((x - canvasRect.left) * scaleX);
    const cssToPixelY = (y: number): number => Math.round((y - canvasRect.top) * scaleY);
    const sample = (x: number, y: number): readonly [number, number, number, number] => {
      const data = ctx.getImageData(cssToPixelX(x), cssToPixelY(y), 1, 1).data;
      return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0] as const;
    };
    const distance = (
      a: readonly [number, number, number, number],
      b: readonly [number, number, number, number],
    ): number =>
      Math.abs(a[0] - b[0]) +
      Math.abs(a[1] - b[1]) +
      Math.abs(a[2] - b[2]) +
      Math.abs(a[3] - b[3]);

    const fill = sample(rect.x + 5, rect.y + rect.h / 2);
    const iconLeft = rect.x + rect.w / 2 - 10;
    const iconTop = rect.y + 6;
    let changedPixels = 0;
    let sampledPixels = 0;
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        sampledPixels += 1;
        const pixel = sample(iconLeft + x + 0.5, iconTop + y + 0.5);
        if (pixel[3] > 0 && distance(pixel, fill) > 45) changedPixels += 1;
      }
    }
    return { changedPixels, sampledPixels };
  }, nodeId);

test("every network node kind resolves to a bundled vendor glyph (no resolve failures)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    'network\n  server a "A"\n  database b "B"\n  cloud c "C"\n  router d "D"\n  switch e "E"\n  firewall f "F"\n  host g "G"\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
    await expect
      .poll(async () => (await iconPaintStats(page, id))?.changedPixels ?? -1)
      .toBeGreaterThan(8);
    await expect.poll(async () => (await iconPaintStats(page, id))?.sampledPixels ?? 0).toBe(400);
  }
  expect(errors).toEqual([]);
});
