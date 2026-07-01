import { expect, test, type Page } from "@playwright/test";
import { openExportMenu } from "./support/menu.js";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("a #src= link reproduces the diagram on load", async ({ page }) => {
  const text = "flowchart LR\n  Shared --> Link\n";
  await page.goto(`/#src=${encodeURIComponent(text)}`);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expectSourceMatches(page, text);
});

test("Share copies the current source without overwriting the current URL", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const edited = "flowchart TD\n  P[Pasteable]\n";
  await setSource(page, edited);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await openExportMenu(page);
  await page.locator("#share-link").click();
  await expect(page.locator("#status")).toContainText("shareable link copied to clipboard");

  const href = await page.evaluate(() => location.href);
  expect(href).not.toContain("#src=");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const hash = new URL(copied).hash;
  expect(hash.startsWith("#src=")).toBe(true);
  expect(decodeURIComponent(hash.slice("#src=".length))).toBe(edited);
});

test("Share puts an oversized link in the address bar while warning", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A diagram whose encoded URL exceeds the ~8000-char share ceiling.
  const lines = Array.from({ length: 500 }, (_, i) => `  Node${i} --> Node${i + 1}`).join("\n");
  await setSource(page, `flowchart TD\n${lines}\n`);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await openExportMenu(page);
  await page.locator("#share-link").click();

  const hash = await page.evaluate(() => location.hash);
  expect(hash.startsWith("#src=")).toBe(true);
  await expect(page.locator("#status")).toHaveAttribute("data-level", "warning");
  await expect(page.locator("#status")).toContainText(/large|truncated/i);
});
