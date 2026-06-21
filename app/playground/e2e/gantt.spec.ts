import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
import { watchPipelineErrors } from "./support/render.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a Gantt chart (sections, dates, after-chains) from the textarea", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Work\n    Research :a, 2024-01-01, 5d\n    Build :b, after a, 1w\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The aria-label names the parsed task bars, so this can't pass on the lingering default flowchart.
  await expect(page.locator("#stage")).toHaveAttribute(
    "aria-label",
    /^gantt diagram:.*Research.*Build/,
  );
  await expect(page.locator("#kind")).toHaveText("gantt");
  expect(errors).toEqual([]);
});

test("renders a Gantt chart with `excludes weekends` (working-day bars)", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "gantt\n  title Sprint\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  section Work\n    Build :b, 2024-01-04, 5d\n    Test :t, after b, 3d\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^gantt diagram:.*Build.*Test/);
  await expect(page.locator("#kind")).toHaveText("gantt");
  expect(errors).toEqual([]);
});

test("the Gantt example loads and parses", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#example").selectOption("gantt");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("gantt");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0); // parsed cleanly

  expect(errors).toEqual([]);
});
