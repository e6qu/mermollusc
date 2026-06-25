import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Selecting many items and pressing Delete removes them all from the source text in one action.
test("select-all then Delete removes every node and edge from the source", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A[Alpha]\n  B[Beta]\n  C[Gamma]\n  A --> B\n  B --> C\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Focus the canvas selection model, select everything, delete.
  await page.locator("#stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");

  const src = await sourceValue(page);
  expect(src).not.toContain("Alpha");
  expect(src).not.toContain("Beta");
  expect(src).not.toContain("Gamma");
  expect(errors).toEqual([]);
});

// Span-keyed families (pie/timeline/mindmap) also delete by source span, so select-all + Delete must
// remove every item without an earlier removal shifting a later span (was gantt-only ordering).
for (const family of [
  {
    name: "pie",
    src: 'pie\n  title Coverage\n  "Alpha" : 30\n  "Beta" : 45\n  "Gamma" : 25\n',
    gone: ["Alpha", "Beta", "Gamma"],
  },
  {
    name: "timeline",
    src: "timeline\n  title Roadmap\n  Q1 : Alpha : Beta\n  Q2 : Gamma\n",
    gone: ["Alpha", "Beta", "Gamma"],
  },
  {
    name: "mindmap",
    src: "mindmap\n  root((Root))\n    Alpha\n    Beta\n    Gamma\n",
    gone: ["Alpha", "Beta", "Gamma"],
  },
]) {
  test(`select-all then Delete clears every ${family.name} item`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
    await setSource(page, family.src);
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

    await page.locator("#stage").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");

    const src = await sourceValue(page);
    for (const label of family.gone) expect(src).not.toContain(label);
    expect(errors).toEqual([]);
  });
}

// Deleting two non-adjacent Gantt tasks leaves the middle task intact — exercises the bottom-up
// source-line ordering so an earlier removal can't shift a later span.
test("deleting two non-adjacent Gantt tasks keeps the one between them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(
    page,
    "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section S\n    First :a, 2024-01-01, 2d\n    Middle :b, after a, 2d\n    Last :c, after b, 2d\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select the first and last task bars via shift-click (top and bottom of the chart), skip the middle.
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.click(box.x + 60, box.y + 40); // First
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 60, box.y + 88); // Last (3rd row) — add to selection
  await page.keyboard.up("Shift");
  await page.keyboard.press("Delete");

  const src = await sourceValue(page);
  expect(src).toContain("Middle");
  expect(errors).toEqual([]);
});
