import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
import { watchPipelineErrors } from "./support/render.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a flowchart with stadium and circle shapes end to end", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "flowchart TD\n  A([Begin]) --> B((Hub))\n  B --> C[Done]\n");
  // Naming the parsed nodes proves the new diagram rendered (not the lingering default sample).
  await expect(page.locator("#stage")).toHaveAttribute(
    "aria-label",
    /flowchart diagram.*Begin.*Hub.*Done/,
  );
  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(errors).toEqual([]);
});
