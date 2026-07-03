import { expect, test, type Page } from "@playwright/test";

// Regression: box-family (block/network/cloud/c4) edges must not run ON a non-endpoint node/container
// border — a channel leg placed on a box's edge merges into its outline. `separateEdgesFromBorders`
// lifts such interior legs OFF the border (fully into the gap where there's room, at least partway in a
// tight gap). This asserts the pass's guarantee: no INTERIOR (movable, non-mount-anchored) segment sits
// coincident with a border (within 2px). Mount-anchored first/last segments on an adjacent border need
// mount re-selection (layout DO_NEXT) and are out of scope here.

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

type Geom = {
  nodes: { id: string; shape: string; x: number; y: number; w: number; h: number }[];
  edges: { from: string; to: string; waypoints: { x: number; y: number }[] }[];
};

// Count edge segments that run PARALLEL to and along (within tol of) a non-endpoint box's border,
// counting only INTERIOR segments (the ones the pass is able to move — not mount-anchored first/last).
const hugCount = (g: Geom): number => {
  const TOL = 2;
  let n = 0;
  for (const e of g.edges) {
    for (let i = 1; i + 1 <= e.waypoints.length - 2; i++) {
      const a = e.waypoints[i];
      const b = e.waypoints[i + 1];
      if (a === undefined || b === undefined) continue;
      const horiz = Math.abs(a.y - b.y) < 0.5;
      const vert = Math.abs(a.x - b.x) < 0.5;
      if (!horiz && !vert) continue;
      for (const box of g.nodes) {
        if (box.id === e.from || box.id === e.to) continue;
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y, b.y);
        if (horiz) {
          const onEdge = Math.abs(a.y - box.y) < TOL || Math.abs(a.y - (box.y + box.h)) < TOL;
          if (onEdge && x0 < box.x + box.w - 3 && x1 > box.x + 3) n++;
        } else {
          const onEdge = Math.abs(a.x - box.x) < TOL || Math.abs(a.x - (box.x + box.w)) < TOL;
          if (onEdge && y0 < box.y + box.h - 3 && y1 > box.y + 3) n++;
        }
      }
    }
  }
  return n;
};

test("cloud box-family edges do not run along node borders (interior legs)", async ({ page }) => {
  await page.goto("/?example=cloud");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const g = (await page.evaluate(() => window.__shownGeometry?.() ?? null)) as Geom | null;
  expect(g).not.toBeNull();
  if (g === null) return;
  // No interior leg sits coincident with a node border (the pass always lifts it off).
  expect(hugCount(g)).toBe(0);
});

// Guard the box-family reroute (`rerouteBoxEdges`): across cloud/network/block/c4, the total count of
// edge segments that CROSS a non-endpoint leaf node's interior or HUG a border must stay at or below
// the level the reroute achieves today. Before the reroute this total was 22; the maze-based reroute
// brings it to 19. A regression that pushes routes back through/along nodes trips this.
const crossOrHugCount = (g: Geom): number => {
  const T = 5;
  let n = 0;
  for (const e of g.edges) {
    for (let i = 0; i + 1 < e.waypoints.length; i++) {
      const a = e.waypoints[i];
      const b = e.waypoints[i + 1];
      if (a === undefined || b === undefined) continue;
      const h = Math.abs(a.y - b.y) < 0.5;
      const v = Math.abs(a.x - b.x) < 0.5;
      if (!h && !v) continue;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      for (const box of g.nodes) {
        if (box.id === e.from || box.id === e.to) continue;
        if (h && (Math.abs(a.y - box.y) < T || Math.abs(a.y - (box.y + box.h)) < T) && x0 < box.x + box.w - 3 && x1 > box.x + 3) n++;
        if (v && (Math.abs(a.x - box.x) < T || Math.abs(a.x - (box.x + box.w)) < T) && y0 < box.y + box.h - 3 && y1 > box.y + 3) n++;
        if (box.shape !== "container") {
          if (h && a.y > box.y + 2 && a.y < box.y + box.h - 2 && x0 < box.x + box.w - 2 && x1 > box.x + 2) n++;
          if (v && a.x > box.x + 2 && a.x < box.x + box.w - 2 && y0 < box.y + box.h - 2 && y1 > box.y + 2) n++;
        }
      }
    }
  }
  return n;
};

test("box families keep routing crossings + hugs at or below the reroute baseline", async ({ page }) => {
  let total = 0;
  for (const ex of ["cloud", "network", "block", "c4"]) {
    await page.goto(`/?example=${ex}`);
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
    const g = (await page.evaluate(() => window.__shownGeometry?.() ?? null)) as Geom | null;
    expect(g).not.toBeNull();
    if (g === null) return;
    total += crossOrHugCount(g);
  }
  // 18 today (22 before the reroute); allow a tiny margin for jitter but catch real regressions.
  expect(total).toBeLessThanOrEqual(19);
});
