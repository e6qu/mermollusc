import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the source panel collapses and expands, and the choice persists across reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const editor = page.locator("#editor");
  const toggle = page.locator("#source-collapse");
  await expect(editor).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await toggle.click();
  await expect(page.locator(".workbench")).toHaveAttribute("data-source-collapsed", /.*/);
  await expect(editor).toBeHidden(); // body hidden; the head stays as the expand handle
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // The preference survives a reload.
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator(".workbench")).toHaveAttribute("data-source-collapsed", /.*/);

  // Expanding brings the editor back (and CodeMirror re-measures to a non-zero height).
  await page.locator("#source-collapse").click();
  await expect(page.locator("#editor")).toBeVisible();
});

test("a parse error force-reveals a collapsed source panel", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await page.locator("#source-collapse").click();
  await expect(page.locator(".workbench")).toHaveAttribute("data-source-collapsed", /.*/);

  // A broken edit must reveal the source — it's the only place to fix it.
  await setSource(page, "flowchart TD\n  A[Start --> broken |\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "error");
  await expect(page.locator(".workbench")).not.toHaveAttribute("data-source-collapsed", /.*/);
});

test("the Export overflow menu opens, runs an action, and closes on Escape / outside click", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const trigger = page.locator("#more-toggle");
  const menu = page.locator("#more-menu");
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // The moved Share action still works from inside the menu.
  await page.locator("#share-link").click();
  await expect(menu).toBeHidden(); // activating an item dismisses the menu
  await expect(page.locator("#status")).toContainText(/link copied|shareable link/i);

  // Escape and outside-click both close it.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(400, 400);
  await expect(menu).toBeHidden();
});

test("the Export menu is keyboard-operable: roving reaches every item and focus returns on activate", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  const trigger = page.locator("#more-toggle");

  // Open: focus lands on the first item; ArrowUp wraps to the last (Reset).
  await trigger.click();
  await expect(page.locator("#copy-png")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#reset-cache")).toBeFocused();

  // ArrowUp again reaches the non-button "Load icons" item (a <label>) — it must be focusable.
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#more-menu label.filebtn")).toBeFocused();

  // Activating an item by keyboard returns focus to the trigger (not <body>).
  await page.keyboard.press("ArrowDown"); // back onto Reset's neighbour
  await page.locator("#copy-png").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#more-menu")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the tool palette is reachable and touch-sized on a phone-width viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const select = page.locator("#tool-select");
  await expect(select).toBeVisible();
  const box = await select.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // WCAG 2.5.5 touch target.
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  // Switching tools works on touch.
  await page.locator("#tool-hand").click();
  await expect(page.locator("#tool-hand")).toHaveAttribute("aria-checked", "true");
});
