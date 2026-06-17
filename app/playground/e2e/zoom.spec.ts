import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
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
  await page.locator("#src").fill("flowchart TD\n  A-->B-->C-->D-->E-->F-->G-->H-->I-->J-->K-->L-->M-->N\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#zoom-fit").click();
  // A 14-node chain is taller than the stage, so Fit must scale below 100%.
  await expect(page.locator("#zoom-reset")).not.toHaveText("100%");

  expect(errors).toEqual([]);
});
