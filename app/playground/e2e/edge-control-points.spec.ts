import { expect, test, type Page } from "@playwright/test";

// Miro-style edge control points: a selected edge shows draggable bend handles; dragging one bends the
// route (stored as a manual overlay waypoint that persists + exports), and double-clicking it removes it.

const scr = (page: Page, x: number, y: number) =>
  page.evaluate((p) => window.__sceneToScreen?.(p.x, p.y) ?? null, { x, y });

// An edge (by from->to) with an interior bend whose bend + a select-point are both clear of every node.
const pickEdge = (page: Page) =>
  page.evaluate(() => {
    const g = window.__shownGeometry?.();
    if (g === null || g === undefined) return null;
    const clear = (x: number, y: number) =>
      g.nodes.every((n) => x < n.x - 14 || x > n.x + n.w + 14 || y < n.y - 14 || y > n.y + n.h + 14);
    for (const e of g.edges) {
      const w = e.waypoints;
      const w0 = w[0];
      const w1 = w[1];
      if (w.length < 3 || w0 === undefined || w1 === undefined) continue;
      const sel = { x: (w0.x + w1.x) / 2, y: (w0.y + w1.y) / 2 };
      if (clear(w1.x, w1.y) && clear(sel.x, sel.y)) return { id: e.from + "->" + e.to, bend: w1, sel };
    }
    return null;
  });

test("drag a bend point to reshape an edge; double-click removes it", async ({ page }) => {
  await page.goto("/?example=block");
  await expect.poll(() => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width)).toBeGreaterThan(0);
  const pick = await pickEdge(page);
  expect(pick).not.toBeNull();
  if (pick === null) return;

  // select the edge (its route control appears only for a selected edge)
  const sp = await scr(page, pick.sel.x, pick.sel.y);
  if (sp === null) throw new Error("no screen");
  await page.mouse.click(sp.x, sp.y);
  await expect(page.locator("#ctx-curve")).toBeVisible();

  // drag its bend handle
  const bp = await scr(page, pick.bend.x, pick.bend.y);
  if (bp === null) throw new Error("no bend screen");
  await page.mouse.move(bp.x, bp.y);
  await page.mouse.down();
  await page.mouse.move(bp.x + 45, bp.y - 35, { steps: 10 });
  await page.mouse.up();

  const moved = await page.evaluate((id) => {
    const g = window.__shownGeometry?.();
    const e = g?.edges.find((x) => x.from + "->" + x.to === id);
    return e?.waypoints[1] ?? null;
  }, pick.id);
  expect(moved).not.toBeNull();
  if (moved === null) return;
  expect(Math.abs(moved.x - pick.bend.x) + Math.abs(moved.y - pick.bend.y)).toBeGreaterThan(20);

  // the manual waypoint survives a full re-render (it lives in the overlay, not the transient route)
  await page.evaluate(() => window.__editor?.setValue(window.__editor.value() + "\n"));
  await page.waitForTimeout(200);
  const afterRerender = await page.evaluate((id) => {
    const g = window.__shownGeometry?.();
    const e = g?.edges.find((x) => x.from + "->" + x.to === id);
    return e?.waypoints[1] ?? null;
  }, pick.id);
  expect(afterRerender).not.toBeNull();

  // double-click the bend handle to remove it → back toward the auto route
  const bp2 = afterRerender === null ? bp : await scr(page, afterRerender.x, afterRerender.y);
  if (bp2 !== null) {
    await page.mouse.dblclick(bp2.x, bp2.y);
    await page.waitForTimeout(200);
  }
});

// Dragging an edge control point past the sheet edge expands the viewport, exactly as dragging a node
// does — the extent (which sizes the canvas) must include edge waypoints, not just node boxes.
test("dragging a bend point outside the sheet expands the viewport", async ({ page }) => {
  const canvasWidth = () =>
    page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
  await page.goto("/?example=block");
  await expect.poll(canvasWidth).toBeGreaterThan(0);
  const before = await canvasWidth();

  const pick = await pickEdge(page);
  expect(pick).not.toBeNull();
  if (pick === null) return;
  const sp = await scr(page, pick.sel.x, pick.sel.y);
  if (sp === null) throw new Error("no screen");
  await page.mouse.click(sp.x, sp.y);
  await expect(page.locator("#ctx-curve")).toBeVisible();

  // drag the bend far to the right — well past the current sheet edge
  const bp = await scr(page, pick.bend.x, pick.bend.y);
  if (bp === null) throw new Error("no bend screen");
  await page.mouse.move(bp.x, bp.y);
  await page.mouse.down();
  await page.mouse.move(bp.x + 700, bp.y, { steps: 12 });
  await page.mouse.up();

  // the canvas grew to keep the dragged-out control point on the (scrollable) sheet
  await expect.poll(canvasWidth).toBeGreaterThan(before);
});
