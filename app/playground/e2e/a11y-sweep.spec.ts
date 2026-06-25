import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("a locatable error status is a keyboard-operable button that jumps into the source", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A clean status is a plain (non-focusable) message…
  const status = page.locator("#status");
  await expect(status).not.toHaveAttribute("role", "button");

  // …a located parse error turns it into a button.
  await setSource(page, "flowchart TD\n  A[Start --> broken |\n");
  await expect(status).toHaveAttribute("data-level", "error");
  await expect(status).toHaveAttribute("role", "button");
  await expect(status).toHaveAttribute("tabindex", "0");

  // Activating it by keyboard moves focus into the editor (the "jump to error").
  await status.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("the selection context-bar exposes exactly one tab stop (roving tabindex)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[Top] --> B[Bottom]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select a node so the context bar shows.
  await page.locator("#diagram-nav").focus();
  await page.locator("#diagram-nav").press("ArrowDown");
  await expect(page.locator("#context-bar")).toBeVisible();

  const tabStops = page.locator("#context-bar button:visible[tabindex='0']");
  await expect(tabStops).toHaveCount(1);

  // Arrow keys move the single tab stop with focus (still exactly one).
  await page.keyboard.press("F2"); // focus the context bar
  await page.keyboard.press("ArrowRight");
  await expect(tabStops).toHaveCount(1);
});
