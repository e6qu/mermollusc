import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const edge = (page: Page, id: string) =>
  page.evaluate((e) => window.__shownEdges?.().find((x) => x.id === e) ?? null, id);
const isCurved = async (page: Page, id: string) => (await edge(page, id))?.curved ?? null;
const pointCount = async (page: Page, id: string) => (await edge(page, id))?.waypoints.length ?? 0;

const selectEdge = async (page: Page, id: string) => {
  const pos = await page.evaluate((e) => window.__edgeLabelPos?.(e) ?? null, id);
  if (pos === null) throw new Error("no edge label position");
  await page.mouse.click(pos.x, pos.y);
};

test("the Route control cycles square → straight → curved (the route label tracks the state)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // A flowchart with a real bend so square vs straight vs curved differ; the bending edge is labelled
  // so the spec can click it.
  await setSource(page, "flowchart TD\n  A[A] --> M{M}\n  M --> B[B]\n  A -->|skip| B\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectEdge(page, "e2"); // the A -->|skip| B edge (bends around M)
  await expect(page.locator("#ctx-curve")).toBeVisible();
  await expect(page.locator("#ctx-curve")).toHaveText("Square");
  const squarePoints = await pointCount(page, "e2");

  await page.locator("#ctx-curve").click(); // square → straight
  await expect(page.locator("#ctx-curve")).toHaveText("Straight");
  expect(await isCurved(page, "e2")).toBe(false);
  expect(await pointCount(page, "e2")).toBe(2); // collapsed to a direct line

  await page.locator("#ctx-curve").click(); // straight → curved
  await expect(page.locator("#ctx-curve")).toHaveText("Curved");
  expect(await isCurved(page, "e2")).toBe(true);

  await page.locator("#ctx-curve").click(); // curved → square (back to the default route)
  await expect(page.locator("#ctx-curve")).toHaveText("Square");
  expect(await isCurved(page, "e2")).toBe(false);
  expect(await pointCount(page, "e2")).toBe(squarePoints);
});

test("a curved route travels in the share link and is undoable (it's real overlay state)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[A] -->|go| B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectEdge(page, "e0");
  await page.locator("#ctx-curve").click(); // → straight
  await page.locator("#ctx-curve").click(); // → curved
  await expect.poll(() => isCurved(page, "e0")).toBe(true);

  // Undo (overlay history) steps the route back from curved → straight.
  await page.locator("#stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => isCurved(page, "e0")).toBe(false);

  // Re-curve (straight → curved is one step), then the share link carries the styling: a fresh load of
  // that URL renders it curved.
  await selectEdge(page, "e0");
  await page.locator("#ctx-curve").click();
  await expect.poll(() => isCurved(page, "e0")).toBe(true);
  const url = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#share-link")?.click();
    return location.href; // Share sets the URL via history.replaceState regardless of clipboard
  });
  expect(url).toContain("overlay=");
  await page.goto(url);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => isCurved(page, "e0")).toBe(true);
});
