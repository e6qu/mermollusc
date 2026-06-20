import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
import { watchPipelineErrors } from "./support/render.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Stage 1 of subgraph support: the parser understands `subgraph … end`, so the pipeline must render
// it without error (nodes lay out flat for now — container grouping comes when layout consumes the
// subgraph data).
test("renders a flowchart with a subgraph end to end without errors", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n",
  );
  // The aria-label names the parsed nodes, so this can't pass on the lingering default sample (which
  // has Start/Choice/Process/End) — it proves the new diagram actually rendered.
  await expect(page.locator("#stage")).toHaveAttribute(
    "aria-label",
    /flowchart diagram.*\bAPI\b.*\bDB\b/,
  );
  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(errors).toEqual([]);
});
