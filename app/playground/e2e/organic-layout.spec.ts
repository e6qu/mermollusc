import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
const SHOT = "/private/tmp/claude-501/-Users-zardoz-projects-mermollusc/7c2ce4b5-41c1-4ba2-a064-1281bfee55c7/scratchpad";
const cw = (page: Page) => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the Organic toggle re-lays-out flowchart with a force layout, persists, no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n  D --> A\n");
  await expect.poll(() => cw(page)).toBeGreaterThan(0);

  const organic = page.locator("#organic");
  await expect(organic).toHaveAttribute("aria-pressed", "false");
  await organic.click();
  await expect(organic).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toContainText(/organic layout on/i);
  await page.waitForTimeout(300);
  await page.locator("#stage").screenshot({ path: `${SHOT}/organic.png` });

  await page.reload();
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await expect(page.locator("#organic")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#organic").click();
  await expect(page.locator("#organic")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
