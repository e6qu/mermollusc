import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const highlight = (page: Page) => page.evaluate(() => window.__editorHighlight?.() ?? "");

test("selecting a node on the canvas highlights its declaration in the source text", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[Top] --> B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select a node via the keyboard navigator — the editor highlights that node's declaration.
  await page.locator("#diagram-nav").focus();
  await page.locator("#diagram-nav").press("ArrowDown");
  await expect.poll(() => highlight(page)).toMatch(/^(A\[Top\]|B\[Bottom\])$/);
});

test("selecting an edge highlights its connector token in the source text", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[Top] -->|go| B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Click the edge label — the editor highlights the edge's label span.
  const pos = await page.evaluate(() => window.__edgeLabelPos?.("e0") ?? null);
  expect(pos).not.toBeNull();
  if (pos === null) return;
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(() => highlight(page)).toBe("go");
});
