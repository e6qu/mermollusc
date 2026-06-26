import { expect, test, type Page } from "@playwright/test";
const cw = (page: Page) => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const zoomPct = (page: Page) => page.locator("#zoom-reset").innerText();

test("a wide diagram is zoomed to fit on load; a small one stays at 100%", async ({ page }) => {
  // Fresh context: the default small flowchart fits at 100% → fit-on-load leaves it untouched.
  await page.goto("/");
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await expect.poll(() => zoomPct(page)).toBe("100%");

  // The git-flow is wider than the viewport → it loads fitted (below 100%).
  await page.goto("/?example=gitGraph");
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await expect
    .poll(async () => Number.parseInt(await zoomPct(page), 10)) // "46%" → 46
    .toBeLessThan(100);
});
