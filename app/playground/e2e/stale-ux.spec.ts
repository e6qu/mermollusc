import { expect, test, type Page } from "@playwright/test";
import { clickNode } from "./support/nodes.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// A parse error must not strand editing chrome over the stale (dimmed) render: the selection
// context bar anchors to a diagram that no longer matches the text, so it hides until the render
// is valid again (the selection itself is restored with the fix).
test("breaking the source hides the selection context bar until fixed", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A[Start] --> B[Done]\n");

  await clickNode(page, "A");
  await expect(page.locator("#context-bar")).toBeVisible();

  await setSource(page, "flowchart TD\n  A[Start --> broken |\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "error");
  await expect(page.locator("#context-bar")).toBeHidden();

  await setSource(page, "flowchart TD\n  A[Start] --> B[Done]\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "ok");
});

// Emptying the source is a fresh start, not a parse failure: no lexer jargon, no ghost of the last
// render, and the stage shows the recovery empty state with a do-this-next task.
test("an emptied source shows a friendly empty state, not a parse error", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A[Start] --> B[Done]\n");
  await clickNode(page, "A");

  await setSource(page, "   \n");
  await expect(page.locator("#status")).toContainText("nothing to render");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "warning");
  await expect(page.locator("#stage-empty")).toBeVisible();
  await expect(page.locator("#context-bar")).toBeHidden();
  await expect(page.locator("#task-status-text")).toContainText("type a diagram");

  // Recovers to a normal render.
  await setSource(page, "flowchart TD\n  A[Start] --> B[Done]\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "ok");
  await expect(page.locator("#stage-empty")).toBeHidden();
});
