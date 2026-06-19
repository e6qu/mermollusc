import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// The diagram sheet zooms via the topbar control; the default view stays at 100% (identity) so the
// hit-test math the edit specs depend on is unchanged.
test("zoom in/out/reset adjusts the sheet and reports the level", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const label = page.locator("#zoom-reset");
  await expect(label).toHaveText("100%");
  const base = await canvasWidth(page);

  await page.locator("#zoom-in").click();
  await expect(label).toHaveText("125%");
  // Zooming re-renders at the higher scale — the backing store actually grows (not a CSS bitmap scale).
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(base);

  await page.locator("#zoom-out").click();
  await expect(label).toHaveText("100%");

  await page.locator("#zoom-in").click();
  await page.locator("#zoom-reset").click();
  await expect(label).toHaveText("100%");

  expect(errors).toEqual([]);
});

test("Fit scales a tall diagram down so all of it fits the stage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await setSource(page, "flowchart TD\n  A-->B-->C-->D-->E-->F-->G-->H-->I-->J-->K-->L-->M-->N\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#zoom-fit").click();
  // A 14-node chain is taller than the stage, so Fit must scale below 100%.
  await expect(page.locator("#zoom-reset")).not.toHaveText("100%");

  expect(errors).toEqual([]);
});

test("dragging the empty canvas pans the (overflowing) stage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await setSource(page, "flowchart TD\n  A-->B-->C-->D-->E-->F-->G-->H-->I-->J-->K-->L-->M-->N\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const wrap = page.locator("#stage-wrap");
  const scrollTopOf = () => wrap.evaluate((el) => el.scrollTop);
  expect(await scrollTopOf()).toBe(0);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Grab the left margin (empty — the node column is centred) and drag up to scroll the sheet down.
  await page.mouse.move(box.x + 8, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 8, box.y - 160);
  await page.mouse.up();

  expect(await scrollTopOf()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("inline editor stays on the node after zooming in (its offset scales with zoom)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // A single node fills most of the (small) canvas, so the canvas centre always lands on it.
  await setSource(page, "flowchart TD\n  A[Start]\n");
  await expect.poll(() => canvasWidth(page)).toBeLessThan(200);

  const editor = page.locator("#inline-edit");
  // The editor overlay's left offset from the canvas left edge (scene→screen for a fixed anchor).
  const editorOffset = async (): Promise<number> => {
    const cr = await page.locator("#stage").boundingBox();
    if (cr === null) throw new Error("no canvas");
    await page.mouse.dblclick(cr.x + cr.width / 2, cr.y + cr.height / 2);
    await expect(editor).toBeVisible();
    const eb = await editor.boundingBox();
    if (eb === null) throw new Error("no editor");
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    return eb.x - cr.x;
  };

  const at100 = await editorOffset();
  await page.locator("#zoom-in").click();
  await page.locator("#zoom-in").click();
  const zoomed = await editorOffset();
  // Pre-fix the overlay ignored viewScale, so this offset was identical at both zooms.
  expect(zoomed).toBeGreaterThan(at100 + 5);
});
