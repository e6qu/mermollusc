import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("a dragged position survives a reload (overlay persisted)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const base = await canvasWidth(page);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 430, box.y + 70, { steps: 8 });
  await page.mouse.up();
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
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await page.mouse.click(box.x + 88, box.y + 56);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 88, box.y + 150);
  await page.keyboard.up("Shift");
  await page.locator("#group").click();
  await expect(page.locator("#ungroup")).toBeEnabled();

  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Selecting a previously-grouped node finds its restored group → Ungroup is enabled again.
  await page.mouse.click(box.x + 88, box.y + 56);
  await expect(page.locator("#ungroup")).toBeEnabled();
  expect(errors).toEqual([]);
});
