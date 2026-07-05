import { test, expect, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
const cw = (page: Page) => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const rectOf = (page: Page, id: string) => page.evaluate((n) => window.__nodeRect?.(n) ?? null, id);
// Scene-space centre of a node (unaffected by extent-origin shifts, unlike the screen rect).
const sceneCenter = (page: Page, id: string) =>
  page.evaluate((n) => {
    const g = window.__shownGeometry?.();
    const node = g?.nodes.find((x: { id: string }) => x.id === n);
    return node ? { x: node.x + node.w / 2, y: node.y + node.h / 2 } : null;
  }, id);
const selectNode = async (page: Page, id: string) => {
  const r = await rectOf(page, id);
  if (r === null) throw new Error("no " + id);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
};
const dist = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) =>
  a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : 0;

test("Relax rearranges any graph family via force; a pinned node stays put", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await setSource(page, "erDiagram\n  A ||--o{ B : x\n  B ||--o{ C : y\n  C ||--o{ D : z\n  A ||--o{ D : w\n");
  await expect.poll(() => cw(page)).toBeGreaterThan(0);
  await page.waitForTimeout(200);

  // pin A
  await selectNode(page, "A");
  await expect(page.locator("#ctx-pin")).toHaveText("Pin");
  await page.locator("#ctx-pin").click();
  await selectNode(page, "A");
  await expect(page.locator("#ctx-pin")).toHaveText("Unpin"); // reflects pinned state
  await page.keyboard.press("Escape");

  const aBefore = await sceneCenter(page, "A");
  const bBefore = await sceneCenter(page, "B");
  await expect(page.locator("#relax")).toBeEnabled();
  await page.locator("#relax").click();
  await page.waitForTimeout(300);
  const aAfter = await sceneCenter(page, "A");
  const bAfter = await sceneCenter(page, "B");

  // pinned A didn't move; unpinned B did
  expect(dist(aBefore, aAfter)).toBeLessThan(2);
  expect(dist(bBefore, bAfter)).toBeGreaterThan(10);
});
