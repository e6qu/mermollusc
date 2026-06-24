import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

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
  await setSource(page,
    'network\n  server web "Web" icon "simpleicons/nginx"\n  database db "DB"\n  web -- db\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.waitForTimeout(200);
  expect(errors).toEqual([]); // a valid override resolves silently

  // …and the other half of the criterion ("or fail loudly"): a bogus ref must surface a loud error, not
  // be silently swallowed (which is exactly what a regression that ignored overrides would do).
  await setSource(
    page,
    'network\n  server web "Web" icon "simpleicons/definitely-not-a-real-icon"\n',
  );
  await expect.poll(() => errors.join("\n")).toMatch(/unknown icon|definitely-not-a-real-icon/);
});
