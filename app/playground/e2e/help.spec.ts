import { expect, test, type Page } from "@playwright/test";

const canvasReady = (page: Page) =>
  expect
    .poll(() => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(0);

test("the ? help overlay opens (button + key) and closes (✕, Escape, backdrop)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await canvasReady(page);

  const overlay = page.locator("#help-overlay");
  await expect(overlay).toBeHidden();

  // open via the toolbar button → the shortcut reference is shown
  const toggle = page.locator("#help-toggle");
  await toggle.click();
  await expect(overlay).toBeVisible();
  await expect(page.locator("#help-close")).toBeFocused();
  await expect(page.locator("#help-panel")).toContainText("box-select");
  await expect(page.locator("#help-panel")).toContainText("nudge");
  await expect(page.locator("#help-panel")).toContainText("resize selected node");
  await expect(page.locator("#help-panel")).toContainText("move between nodes and edges");
  await expect(page.locator("#help-panel")).toContainText("remove the active item");

  // Tab stays inside the modal, and closing returns focus to the trigger.
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#help-close")).toBeFocused();

  // close via ✕
  await page.locator("#help-close").click();
  await expect(overlay).toBeHidden();
  await expect(toggle).toBeFocused();

  // open via the "?" key, close via Escape
  await page.keyboard.press("?");
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();

  // open again, close by clicking the backdrop
  await page.locator("#help-toggle").click();
  await expect(overlay).toBeVisible();
  await page.locator("#help-overlay").click({ position: { x: 8, y: 8 } });
  await expect(overlay).toBeHidden();

  expect(errors).toEqual([]);
});
