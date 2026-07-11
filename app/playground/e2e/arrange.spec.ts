import { expect, test, type Page } from "@playwright/test";
import { nodeRect } from "./support/nodes.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The x of every persisted position override (rounded). Already-aligned nodes do not get no-op
// overrides, so the list contains only nodes Arrange actually moved.
const overrideXs = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as {
      overrides?: ReadonlyArray<[string, { position: { x: number } }]>;
    };
    return (parsed.overrides ?? []).map(([, o]) => Math.round(o.position.x));
  });

// Shift-drag a marquee that covers exactly the top three nodes (Start A, diamond B, Process C) and
// stops above End D. Computed from the live node rects — a hardcoded pixel marquee broke when node
// sizes changed (e.g. the decision diamond grew to fit its label + icon).
const marqueeTopThree = async (page: Page): Promise<void> => {
  const a = await nodeRect(page, "A");
  const b = await nodeRect(page, "B");
  const c = await nodeRect(page, "C");
  const d = await nodeRect(page, "D");
  const left = Math.min(a.x, b.x, c.x) - 12;
  const right = Math.max(a.x + a.w, b.x + b.w, c.x + c.w) + 12;
  const top = a.y - 12;
  // Below C but above D, so the marquee grabs A/B/C and never touches End.
  const bottom = Math.min((c.y + c.h + d.y) / 2, d.y - 4);
  await page.keyboard.down("Shift");
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
};

test("Arrange → Align Left snaps the selected nodes to a common left edge", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#arrange")).toBeDisabled(); // nothing selected

  await marqueeTopThree(page);

  await expect(page.locator("#arrange")).toBeEnabled();
  await page.locator("#arrange").click();
  await expect(page.locator("#align-left")).toBeVisible();
  await page.locator("#align-left").click();

  // Only moved nodes are persisted; they share the target left edge, and the popover closed.
  await expect(page.locator("#align-left")).toBeHidden();
  const xs = await overrideXs(page);
  expect(xs.length).toBeGreaterThanOrEqual(2);
  expect(new Set(xs).size).toBe(1);

  expect(errors).toEqual([]);
});

test("Arrange undoes as one step", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await marqueeTopThree(page);
  await page.locator("#arrange").click();
  await page.locator("#align-left").click();
  expect((await overrideXs(page)).length).toBeGreaterThanOrEqual(2);

  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideXs(page)).toEqual([]); // one undo reverts the whole align
});
