import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const selectNode = async (page: Page, id: string) => {
  const r = await page.evaluate((n) => window.__nodeRect?.(n) ?? null, id);
  if (r === null) throw new Error(`no node ${id}`);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
};
const selectFirstEdge = async (page: Page) => {
  const edges = await page.evaluate(() => window.__shownEdges?.() ?? []);
  const e0 = edges[0];
  if (e0 === undefined) throw new Error("no edge");
  const a = e0.waypoints[0];
  const b = e0.waypoints[e0.waypoints.length - 1];
  if (a === undefined || b === undefined) throw new Error("edge has no waypoints");
  const s = await page.evaluate((p) => window.__sceneToScreen?.(p.x, p.y) ?? null, {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  if (s === null) throw new Error("no screen");
  await page.mouse.click(s.x, s.y);
};

// Regression: node/edge colour written to the source (state, per #278/#280) must be reflected back in
// the swatch on reselect — the swatch used to read only the overlay, so a source colour showed as "none".
test("a state node's source colour reselects as the active swatch", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectNode(page, "Idle");
  await page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]').click();
  await page.keyboard.press("Escape");
  await selectNode(page, "Idle");
  await expect(page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("a state edge's source colour reselects as the active swatch", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectFirstEdge(page);
  await page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]').click();
  await page.keyboard.press("Escape");
  await selectFirstEdge(page);
  await expect(page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
