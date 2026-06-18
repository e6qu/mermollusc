import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("marks the failing span inline on a parse error and clears it once valid", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // An incomplete edge fails to parse; the parser's line:col becomes an editor diagnostic — a gutter
  // marker (always shown) plus an underline when the failing span sits within the text.
  await setSource(page, "flowchart TD\n  A --> \n");
  await expect(page.locator(".cm-lint-marker-error")).toBeVisible();

  await setSource(page, "flowchart TD\n  A --> B\n");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0);
});

test("syntax-highlights the source (keyword tokens get their own spans)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A --> B\n");
  // The tokenizer wraps highlighted tokens in styled spans; a plain <textarea> never would.
  await expect(page.locator(".cm-content span").first()).toBeVisible();
});
