import { expect, test } from "@playwright/test";

// Flow: load the playground → the read pipeline (parse → layout → render) paints the canvas.
// As the builder adds interactions, add one spec per flow here.
test("renders the sample flowchart with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");

  const canvas = page.locator("#stage");
  await expect(canvas).toBeVisible();

  // main.ts sizes the canvas to the laid-out scene extent, so width grows past a token value.
  await expect
    .poll(() => canvas.evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(100);

  expect(errors).toEqual([]);
});
