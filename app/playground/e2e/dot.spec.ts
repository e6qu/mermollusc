import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("imports a Graphviz DOT digraph and renders it as a flowchart", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const parseErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("parse failed")) parseErrors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, 'digraph G {\n  rankdir=LR\n  a [shape=box]\n  a -> b -> c\n  c -> a [label="loop"]\n}\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // DOT is imported into the flowchart model, so the kind badge reads "flowchart".
  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(parseErrors).toEqual([]);
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
