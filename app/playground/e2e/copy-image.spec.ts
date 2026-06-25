import { expect, test } from "@playwright/test";
import { openExportMenu } from "./support/menu.js";

// "Copy" puts the rendered diagram on the clipboard as a PNG (so it can be pasted into a doc/chat/
// issue without a download). Grant clipboard permissions, click Copy, and confirm both the status
// feedback and that an image/png item actually landed on the clipboard.
test("Copy puts a PNG image of the diagram on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect
    .poll(() => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(0);

  await openExportMenu(page);
  await page.locator("#copy-png").click();
  await expect(page.locator("#status")).toHaveText(/copied to clipboard/);

  const hasImage = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.some((i) => i.types.includes("image/png"));
  });
  expect(hasImage).toBe(true);
  expect(errors).toEqual([]);
});
