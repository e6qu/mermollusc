import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Connect joins two shift-selected nodes with an edge in the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A single top-down chain: both nodes share the canvas centre-x; top/bottom sit a fixed
  // inset from the canvas edges, so these hit points hold whatever spacing ELK picks.
  await setSource(page, "flowchart TB\n  A[Alpha] --> B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  const cx = box.x + box.width / 2;

  await page.keyboard.down("Shift");
  await page.mouse.click(cx, box.y + 44);
  await page.mouse.click(cx, box.y + box.height - 44);
  await page.keyboard.up("Shift");

  await page.locator("#connect").click();

  // The appended bare edge `A --> B` is distinct from the original `A[Alpha] --> B[Beta]`.
  await expectSourceMatches(page, /\n {2}A --> B\n/);
});
