import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

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
      clippedControls: Array.from(
        document.querySelectorAll<HTMLElement>(".topbar-actions button, .topbar-actions .filebtn"),
      ).filter((el) => {
        const box = el.getBoundingClientRect();
        return box.left < -1 || box.right > document.documentElement.clientWidth + 1;
      }).length,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.stageTop).toBeGreaterThanOrEqual(metrics.editorBottom - 1);
  expect(metrics.editorLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.stageLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.editorRight).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.stageRight).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.clippedControls).toBe(0);
});

test("phone-width workflows keep editor, relabel, help, and icon drawer usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await setSource(page, "flowchart TD\n  A[Alpha]\n  B[Beta]\n  A --> B\n");
  await page.locator("#diagram-nav").focus();
  await page.locator("#diagram-nav").press("Enter");
  const inline = page.locator("#inline-edit");
  await expect(inline).toBeVisible();
  await inline.fill("Alpha mobile");
  await inline.press("Enter");
  await expect.poll(() => sourceValue(page)).toContain("Alpha mobile");

  await page.locator("#help-toggle").click();
  await expect(page.locator("#help-overlay")).toBeVisible();
  await expect(page.locator("#help-panel")).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-overlay")).toBeHidden();

  await page.locator("#icons-toggle").click();
  const picker = page.locator("#icon-picker");
  await expect(picker).toBeVisible();
  await expect(page.locator("#icon-backdrop")).toBeVisible();
  const width = await picker.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
});

test("phone-width stage keeps pan and zoom controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await setSource(
    page,
    "flowchart TD\n  A-->B\n  A-->C\n  B-->D\n  C-->D\n  D-->E\n  E-->F\n  F-->G\n  G-->H\n  H-->I\n",
  );
  await page.locator("#zoom-in").click();
  await expect(page.locator("#zoom-reset")).toHaveText("125%");

  const stageWrap = page.locator("#stage-wrap");
  await stageWrap.evaluate((el) => {
    el.scrollLeft = 40;
    el.scrollTop = 40;
  });
  const scroll = await stageWrap.evaluate((el) => ({
    left: el.scrollLeft,
    top: el.scrollTop,
  }));
  expect(scroll.left + scroll.top).toBeGreaterThan(0);
});
