import { expect, test, type Page } from "@playwright/test";
import { openExportMenu } from "./support/menu.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const accent = (page: Page, id: string) =>
  page.evaluate((n) => window.__nodeAccent?.(n) ?? null, id);

test("the Colour control cycles a node's accent (visual-only) and persists across reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[A] --> B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(await accent(page, "A")).toBe("none");

  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;
  await page.mouse.click(box.x + box.width / 2, box.y + 40); // select node A
  const swatches = page.locator("#ctx-colour-swatches");
  await expect(swatches).toBeVisible();
  await expect(swatches).toHaveAttribute("role", "radiogroup");

  const activeSwatch = page.locator('#ctx-colour-swatches .swatch[data-accent="active"]');
  await expect(activeSwatch).toHaveAttribute("role", "radio");
  await activeSwatch.click();
  await expect.poll(() => accent(page, "A")).toBe("active");
  await expect(activeSwatch).toHaveAttribute("aria-checked", "true");

  await activeSwatch.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => accent(page, "A")).toBe("danger");

  const mutedSwatch = page.locator('#ctx-colour-swatches .swatch[data-accent="muted"]');
  await mutedSwatch.click();
  await expect.poll(() => accent(page, "A")).toBe("muted");

  // Survives a reload (per-browser visual preference).
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect.poll(() => accent(page, "A")).toBe("muted");

  // Travels in a share link as overlay state, without needing Mermaid-specific style text.
  await openExportMenu(page);
  await page.locator("#share-link").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("overlay=");
  await page.goto(copied);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect.poll(() => accent(page, "A")).toBe("muted");

  const sharedBox = await page.locator("#stage").boundingBox();
  if (sharedBox === null) return;
  await page.mouse.click(sharedBox.x + sharedBox.width / 2, sharedBox.y + 40);
  await page.locator('#ctx-colour-swatches .swatch[data-accent="none"]').click();
  await expect.poll(() => accent(page, "A")).toBe("none");
});
