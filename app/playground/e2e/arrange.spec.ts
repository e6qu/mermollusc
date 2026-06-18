import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The x of every persisted position override (rounded), so we can check they share an edge.
const overrideXs = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as {
      overrides?: ReadonlyArray<[string, { position: { x: number } }]>;
    };
    return (parsed.overrides ?? []).map(([, o]) => Math.round(o.position.x));
  });

test("Arrange → Align Left snaps the selected nodes to a common left edge", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await expect(page.locator("#arrange")).toBeDisabled(); // nothing selected

  // Box-select the top three nodes (Start ~y56, Choice ~y150, Process ~y240).
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + 24, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 210, box.y + 270, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  await expect(page.locator("#arrange")).toBeEnabled();
  await page.locator("#arrange").click();
  await expect(page.locator("#align-left")).toBeVisible();
  await page.locator("#align-left").click();

  // Every moved node now shares one left edge, and the popover closed.
  await expect(page.locator("#align-left")).toBeHidden();
  const xs = await overrideXs(page);
  expect(xs.length).toBeGreaterThanOrEqual(3);
  expect(new Set(xs).size).toBe(1);

  expect(errors).toEqual([]);
});

test("Arrange undoes as one step", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;

  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + 24, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 210, box.y + 270, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.locator("#arrange").click();
  await page.locator("#align-left").click();
  expect((await overrideXs(page)).length).toBeGreaterThanOrEqual(3);

  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideXs(page)).toEqual([]); // one undo reverts the whole align
});
