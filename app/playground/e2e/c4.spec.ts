import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a C4 diagram (with a nested boundary) from the textarea", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page,
    'C4Context\n  Person(alice, "Alice")\n  Boundary(b, "Backend") {\n    Container(api, "API")\n    Container(db, "Database")\n  }\n  Rel(alice, api, "uses")\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The aria-label names the rendered kind + elements, so this can't pass on the lingering default
  // flowchart sample — it proves the C4 diagram actually rendered.
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^c4 diagram:.*\bAPI\b/);
  expect(errors).toEqual([]);
});

test("renders C4 elements with the optional description argument", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    'C4Context\n  Person(alice, "Alice", "A customer")\n  System(web, "Web", "The app")\n  Rel(alice, web, "uses")\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The 3-arg form is accepted: the C4 diagram renders (named in the aria-label) with no pipeline error.
  // (dotAll: an element's label + description are joined by a newline in the aria text.)
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^c4 diagram:.*\bWeb\b/s);
  expect(errors).toEqual([]);
});
