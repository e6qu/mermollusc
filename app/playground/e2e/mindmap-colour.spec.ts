import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
const canvasWidth = (page: Page) => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const src2 = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");
const selN = async (page: Page, id: string) => {
  const r = await page.evaluate((n) => window.__nodeRect?.(n) ?? null, id);
  if (r === null) throw new Error("no " + id);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
};
test("mindmap node colour writes ::: + classDef to source", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "mindmap\n  root((Root))\n    A\n    B\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await selN(page, "n1"); // A
  await page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]').click();
  await expect.poll(() => src2(page)).toContain("A:::danger");
  await expect.poll(() => src2(page)).toContain("classDef danger fill:");
  // re-colour in place — n1's ::: swaps, no second class on A
  await selN(page, "n1");
  await page.locator('#ctx-colour-swatches .swatch[data-accent="compute"]').click();
  await expect.poll(() => src2(page)).toContain("A:::compute");
  await expect.poll(() => src2(page).then((t)=>(t.match(/A:::/g)??[]).length)).toBe(1);
  // swatch reflects on reselect
  await page.keyboard.press("Escape");
  await selN(page, "n1");
  await expect(page.locator('#ctx-colour-swatches .swatch[data-accent="compute"]')).toHaveAttribute("aria-checked","true");
  // clear removes :::
  await page.locator('#ctx-colour-swatches .swatch[data-accent="none"]').click();
  await expect.poll(() => src2(page)).not.toContain("A:::");
});
