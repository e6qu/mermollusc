import { expect, test } from "@playwright/test";

const canvasWidth = (page: import("@playwright/test").Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Stage 1 of subgraph support: the parser understands `subgraph … end`, so the pipeline must render
// it without error (nodes lay out flat for now — container grouping comes when layout consumes the
// subgraph data).
test("renders a flowchart with a subgraph end to end without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page
    .locator("#src")
    .fill("flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
