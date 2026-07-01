import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the icon picker filters and inserts an icon override at the caret", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A network node line (icon overrides apply to network/cloud/block); place the caret at the end of
  // the document so the inserted override lands on that node line and the source stays valid.
  await setSource(page, 'network\n  server web "Web"');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ArrowRight");

  await page.locator("#icons-toggle").click();
  await expect(page.locator("#icon-filter")).toBeFocused();
  const picker = page.locator("#icon-picker");
  await expect(picker).toBeVisible();
  await expect(page.locator("#icon-backdrop")).toBeVisible();
  await expect(picker.locator('label[for="load-pack"]')).toContainText("Load icon pack");

  await page.locator("#icon-filter").fill("docker");
  const first = page.locator("#icon-grid .picker-icon").first();
  await expect(first).toBeVisible();
  await first.click();

  // An `icon "<pack>/docker"` override was inserted into the source.
  await expectSourceMatches(page, /icon "[^"]+\/docker"/);

  await page.locator("#icons-close").click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#icon-backdrop")).toBeHidden();
  await expect(page.locator("#icons-toggle")).toBeFocused();
});

test("the icon filter reports when nothing matches", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // The icon picker is only offered on families that accept an icon override (network/cloud/block).
  await setSource(page, 'network\n  server web "Web"');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#icons-toggle").click();
  await page.locator("#icon-filter").fill("zzz-no-such-icon");
  await expect(page.locator("#icon-grid .picker-empty")).toBeVisible();
  await page.locator("#icon-backdrop").click({ position: { x: 8, y: 8 } });
  await expect(page.locator("#icon-picker")).toBeHidden();
  await page.locator("#icons-toggle").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#icon-picker")).toBeHidden();
});
