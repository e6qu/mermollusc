import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a sequence diagram from the textarea", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "sequenceDiagram\n  A->>B: Hello\n  B-->>A: Hi there\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^sequence diagram:/);
  await expect(page.locator("#kind")).toHaveText("sequence");
  expect(errors).toEqual([]);
});
