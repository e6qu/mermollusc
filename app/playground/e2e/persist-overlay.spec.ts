import { expect, test, type Page } from "@playwright/test";
import { clickNode, dragNodeBy } from "./support/nodes.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("a dragged position survives a reload (overlay persisted)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const base = await canvasWidth(page);

  await dragNodeBy(page, "A", 342, 14);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(base);

  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(base); // restored, still grown
  expect(errors).toEqual([]);
});

test("a group survives a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await clickNode(page, "A");
  await page.keyboard.down("Shift");
  await clickNode(page, "B");
  await page.keyboard.up("Shift");
  await page.locator("#group").click();
  await expect(page.locator("#ungroup")).toBeEnabled();

  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Selecting a previously-grouped node finds its restored group → Ungroup is enabled again.
  await clickNode(page, "A");
  await expect(page.locator("#ungroup")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("stale overlay is cleared when manually pasting a different diagram that reuses IDs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const baseWidth = await canvasWidth(page);

  await dragNodeBy(page, "A", 212, 14);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(baseWidth);

  // Paste a completely different flowchart structure that still reuses IDs A and B.
  // Similarity between old features and new features is low, triggering overlay prune/clear.
  const newFlowchart = "flowchart TD\n  B[Success] --> A[Login]\n";
  await setSource(page, newFlowchart);

  // Wait for stage to render.
  await expect(page.locator("#stage")).toBeVisible();

  // Reload and verify that overrides are gone (canvas width returned to a normal non-dragged extent)
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeLessThan(baseWidth + 50);
  expect(errors).toEqual([]);
});
