import { expect, test, type Page } from "@playwright/test";
const cw = (page: Page) => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const zoomPct = (page: Page) => page.locator("#zoom-reset").innerText();

test("a wide diagram is zoomed to fit on load; a small one stays at 100%", async ({ page }) => {
  // Fresh context: the default small flowchart fits at 100% → fit-on-load leaves it untouched.
  await page.goto("/");
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await expect.poll(() => zoomPct(page)).toBe("100%");

  // The git-flow under the (wide) pills style overflows the viewport → it loads fitted (below 100%).
  // The default classic gitGraph draws compact Mermaid-style commit dots and fits at 100%, so the wide
  // style is requested explicitly via the share-link style param.
  await page.goto("/?example=gitGraph#style=pills");
  await page.reload();
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await expect
    .poll(async () => Number.parseInt(await zoomPct(page), 10)) // "46%" → 46
    .toBeLessThan(100);
});
