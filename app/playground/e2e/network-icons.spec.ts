import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("every network node kind resolves to a built-in glyph (no resolve failures)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page.locator("#src").fill(
    'network\n  server a "A"\n  database b "B"\n  cloud c "C"\n  router d "D"\n  switch e "E"\n  firewall f "F"\n  host g "G"\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Give the async icon rasterisation a moment to settle, then assert no errors were logged.
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});
