import { expect, test, type Page } from "@playwright/test";
import { sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// ⌥-drag from one node to another creates an edge between them (in the family's syntax), without the
// select-two-then-Connect dance. The default sample has 4 edges; ⌥-dragging Start→Choice adds a fifth.
test("⌥-drag from one node to another creates an edge", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /flowchart diagram: 4 node.*4 edge/);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // hold ⌥ across the drag from Start (≈88,56) to Choice (≈88,150)
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 88, box.y + 150, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");

  // a fifth edge now exists — and the source gained the flowchart arrow syntax between the real ids
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /5 edge/);
  await expect.poll(() => sourceValue(page)).toMatch(/\n\s*A --> B\s*\n/);

  expect(errors).toEqual([]);
});

// Releasing ⌥-drag on empty space (no target node) makes no edge and doesn't error.
test("⌥-drag released on empty space creates no edge", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;

  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 700, box.y + 600, { steps: 6 }); // far from any node
  await page.mouse.up();
  await page.keyboard.up("Alt");

  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /4 edge/);
  expect(errors).toEqual([]);
});
