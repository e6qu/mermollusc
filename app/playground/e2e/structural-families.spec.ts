import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Connect/Delete now work beyond flowchart. Network is the representative undirected family (`a -- b`).
test("Connect links two network nodes with an undirected `a -- b`", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#src").fill('network\n  server a "A"\n  server b "B"\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Two nodes lay out side by side (a left, b right) on one row — select both, then Connect.
  const cy = box.y + box.height / 2;
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 44, cy);
  await page.mouse.click(box.x + box.width - 44, cy);
  await page.keyboard.up("Shift");

  await expect(page.locator("#connect")).toBeEnabled();
  await page.locator("#connect").click();
  await expect(page.locator("#src")).toHaveValue(/\n {2}a -- b\n/);
});

test("Delete removes a network node and its links from the source", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#src").fill('network\n  server a "A"\n  server b "B"\n  a -- b\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + 44, box.y + box.height / 2); // select node "a"
  await page.keyboard.press("Delete");

  await expect(page.locator("#src")).not.toHaveValue(/server a/);
  await expect(page.locator("#src")).not.toHaveValue(/a -- b/);
  expect(errors).toEqual([]);
});
