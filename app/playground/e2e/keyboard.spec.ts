import { expect, test, type Page } from "@playwright/test";
import { clickNode } from "./support/nodes.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const overrideCount = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return 0;
    const parsed = JSON.parse(raw) as { overrides?: unknown[] };
    return parsed.overrides?.length ?? 0;
  });

test("⌘A selects every node and Escape clears the selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Move focus off the editor (which owns ⌘A for text) by clicking the stage wrapper.
  await page.locator("#stage").click({ position: { x: 5, y: 5 } });

  await page.keyboard.press("Control+a");
  await expect(page.locator("#group")).toBeEnabled(); // many nodes selected

  await page.keyboard.press("Escape");
  await expect(page.locator("#group")).toBeDisabled(); // selection cleared

  expect(errors).toEqual([]);
});

test("arrow keys nudge the selection and the whole run is one undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await clickNode(page, "A"); // select the Start node
  expect(await overrideCount(page)).toBe(0);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => overrideCount(page)).toBe(1); // one node moved, one override

  await page.keyboard.press("Control+z"); // a nudge run collapses to a single undo
  await expect.poll(() => overrideCount(page)).toBe(0);

  expect(errors).toEqual([]);
});
