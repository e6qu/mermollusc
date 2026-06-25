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

test("Share encodes the current source into the URL hash", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const edited = "flowchart TD\n  P[Pasteable]\n";
  await setSource(page, edited);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await openExportMenu(page);
  await page.locator("#share-link").click();

  const hash = await page.evaluate(() => location.hash);
  expect(hash.startsWith("#src=")).toBe(true);
  expect(decodeURIComponent(hash.slice("#src=".length))).toBe(edited);
});
