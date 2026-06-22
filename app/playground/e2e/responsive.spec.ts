import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("phone-width layout stacks editor and stage without page-level horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const metrics = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(".editor");
    const stageCol = document.querySelector<HTMLElement>(".stage-col");
    if (editor === null || stageCol === null) throw new Error("workbench elements missing");
    const editorBox = editor.getBoundingClientRect();
    const stageBox = stageCol.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      editorBottom: editorBox.bottom,
      editorLeft: editorBox.left,
      editorRight: editorBox.right,
      stageLeft: stageBox.left,
      stageRight: stageBox.right,
      stageTop: stageBox.top,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.stageTop).toBeGreaterThanOrEqual(metrics.editorBottom - 1);
  expect(metrics.editorLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.stageLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.editorRight).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.stageRight).toBeLessThanOrEqual(metrics.clientWidth + 1);
});
