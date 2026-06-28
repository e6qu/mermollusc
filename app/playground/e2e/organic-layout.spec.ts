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

  const styleSelect = page.locator("#layout-style");
  await expect(styleSelect).toHaveValue("tidy");
  await styleSelect.selectOption("organic");
  await expect(styleSelect).toHaveValue("organic");
  await expect(page.locator("#status")).toContainText(/layout style changed to organic/i);
  await page.waitForTimeout(300);
  await page.locator("#stage").screenshot({ path: `${SHOT}/organic.png` });

  await page.reload();
  await expect.poll(() => cw(page)).toBeGreaterThan(100);
  await expect(page.locator("#layout-style")).toHaveValue("organic");
  await page.locator("#layout-style").selectOption("tidy");
  await expect(page.locator("#layout-style")).toHaveValue("tidy");
  expect(errors).toEqual([]);
});
