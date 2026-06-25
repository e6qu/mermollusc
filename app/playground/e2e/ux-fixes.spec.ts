import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Regenerate is disabled while the source is invalid, re-enabled when fixed", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  // A valid flowchart: Regenerate is available.
  await setSource(page, "flowchart TD\n  A[One] --> B[Two]\n");
  await expect(page.locator("#regenerate")).toBeEnabled();

  // Break the source — Regenerate must disable (parity with Relax/Add), not silently re-render garbage.
  await setSource(page, "flowchart TD\n  A[One] -->\n");
  await expect(page.locator("#regenerate")).toBeDisabled();

  // Fix it — Regenerate comes back.
  await setSource(page, "flowchart TD\n  A[One] --> B[Two]\n");
  await expect(page.locator("#regenerate")).toBeEnabled();
});

test("opening the help dialog marks the page chrome inert, and closing restores it", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const workbench = page.locator(".workbench");
  await expect(workbench).not.toHaveAttribute("inert", /.*/);

  await page.locator("#help-toggle").click();
  await expect(page.locator("#help-overlay")).toBeVisible();
  // The background chrome is inert so a screen-reader cursor can't wander behind the modal.
  await expect(workbench).toHaveAttribute("inert", /.*/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#help-overlay")).toBeHidden();
  await expect(workbench).not.toHaveAttribute("inert", /.*/);
});
