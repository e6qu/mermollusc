import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders an ER diagram (entities + cardinality relationships) from the textarea", async ({
  page,
}) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER }|..|| PRODUCT\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#kind")).toHaveText("er");
  // The canvas text alternative reflects the entities.
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /er diagram.*CUSTOMER/);
  expect(errors).toEqual([]);
});

test("renders entity attribute blocks (crow's-foot + compartment rows) without error", async ({
  page,
}) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    'erDiagram\n  CUSTOMER {\n    string name PK\n    string email UK\n  }\n  CUSTOMER ||--o{ ORDER : places\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#kind")).toHaveText("er");
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /er diagram.*CUSTOMER/);
  expect(errors).toEqual([]);
});

test("the ER example loads and parses cleanly", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#example").selectOption("er");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("er");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0);

  expect(errors).toEqual([]);
});
