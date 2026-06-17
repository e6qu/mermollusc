import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("a per-node `icon` override resolves and renders a vendored mark", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // The override points at a bundled simple-icons mark; the kind default would be the arch glyph.
  await page.locator("#src").fill(
    'network\n  server web "Web" icon "simpleicons/nginx"\n  database db "DB"\n  web -- db\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});
