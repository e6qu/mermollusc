import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a mindmap (indented hierarchy, shapes) from the textarea", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "mindmap\n  root((Root))\n    Branch A\n      Leaf 1\n      Leaf 2\n    sq[Branch B]\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^mindmap diagram:/);
  await expect(page.locator("#kind")).toHaveText("mindmap");
  expect(errors).toEqual([]);
});

test("the Mindmap example loads and parses", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#example").selectOption("mindmap");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("mindmap");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0); // parsed cleanly

  expect(errors).toEqual([]);
});
