import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
import { watchPipelineErrors } from "./support/render.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("imports a Graphviz DOT digraph and renders it as a flowchart", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, 'digraph G {\n  rankdir=LR\n  a [shape=box]\n  a -> b -> c\n  c -> a [label="loop"]\n}\n');
  // DOT is imported into the flowchart model, so the kind badge reads "flowchart"; the imported graph
  // has 3 nodes (a/b/c), unlike the 4-node default sample — so this can't pass on a stale render.
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /flowchart diagram: 3 node/);
  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(errors).toEqual([]);
});

test("the DOT example loads and parses", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#example").selectOption("dot");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("flowchart");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0); // parsed cleanly

  expect(errors).toEqual([]);
});

test("a malformed DOT edge surfaces a lint error", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // `->` with no target: the unexpected `}` is a located token, so the editor marks it.
  await setSource(page, "digraph { a -> }");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(1);
});
