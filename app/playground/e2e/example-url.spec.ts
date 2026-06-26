import { expect, test, type Page } from "@playwright/test";

const editorText = (page: Page) =>
  page.locator(".cm-content, #editor, textarea").first().innerText();

test("an ?example= URL loads that example, and selecting one updates the URL", async ({ page }) => {
  // A shared example URL loads straight into that diagram.
  await page.goto("/?example=gitGraph");
  await expect.poll(() => editorText(page)).toContain("gitGraph");

  // Selecting another example rewrites the URL to its own stable link.
  await page.locator("#example").selectOption("pie");
  await expect.poll(() => new URL(page.url()).searchParams.get("example")).toBe("pie");
  await expect.poll(() => editorText(page)).toContain("pie");

  // That link round-trips: a fresh load of it shows the pie example.
  await page.goto(`/?example=pie`);
  await expect.poll(() => editorText(page)).toContain("pie");

  // An unknown example name falls back to the persisted/sample source rather than blanking.
  await page.goto("/?example=does-not-exist");
  await expect.poll(() => editorText(page)).not.toBe("");
});
