import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Fixture paths resolve relative to the package cwd (where Playwright runs).
const ARCH_PACK = "e2e/fixtures/arch-pack.json";
const BROKEN_PACK = "e2e/fixtures/broken-pack.txt";

test("loading a user icon pack re-renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A network diagram is enough to exercise icon registry reload and repaint.
  await setSource(page, 'network\n  server web "Web"\n  database db "DB"\n  web -- db\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#load-pack").setInputFiles(ARCH_PACK);

  await page.waitForTimeout(200);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("loading malformed pack JSON is reported, not crashed", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page.locator("#load-pack").setInputFiles(BROKEN_PACK);

  await page.waitForTimeout(150);
  // The canvas still renders and nothing throws to the page (the error is logged, not fatal).
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
