import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const sourceText = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");

// Select the first shown edge, then drag its `to` endpoint onto node `targetId`. Pointer events are
// dispatched directly on the canvas so the floating context bar (which can overlap a short edge's
// endpoint) doesn't intercept them — the same interaction the pointer handlers see.
const dragToEndpointOnto = async (page: Page, targetId: string): Promise<void> => {
  const edges = await page.evaluate(() => window.__shownEdges?.() ?? []);
  const e0 = edges[0];
  if (e0 === undefined) throw new Error("no edge");
  const wl = e0.waypoints[e0.waypoints.length - 1];
  const a = e0.waypoints[0];
  if (wl === undefined || a === undefined) throw new Error("no waypoints");
  const mid = { x: (a.x + wl.x) / 2, y: (a.y + wl.y) / 2 };
  const midScr = await page.evaluate((p) => window.__sceneToScreen?.(p.x, p.y) ?? null, mid);
  if (midScr === null) throw new Error("no screen");
  await page.mouse.click(midScr.x, midScr.y); // select the edge
  await page.waitForTimeout(150);
  const endScr = await page.evaluate((p) => window.__sceneToScreen?.(p.x, p.y) ?? null, wl);
  const rect = await page.evaluate((id) => window.__nodeRect?.(id) ?? null, targetId);
  if (endScr === null || rect === null) throw new Error("no coords");
  const to = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  await page.evaluate(
    ({ from, dest }) => {
      const cv = document.querySelector("#stage");
      if (!(cv instanceof HTMLCanvasElement)) return;
      cv.setPointerCapture = () => {};
      cv.releasePointerCapture = () => {};
      const mk = (type: string, p: { x: number; y: number }) =>
        new PointerEvent(type, {
          pointerId: 1,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        });
      cv.dispatchEvent(mk("pointerdown", from));
      cv.dispatchEvent(mk("pointermove", { x: (from.x + dest.x) / 2, y: (from.y + dest.y) / 2 }));
      cv.dispatchEvent(mk("pointermove", dest));
      cv.dispatchEvent(mk("pointerup", dest));
    },
    { from: endScr, dest: to },
  );
  await page.waitForTimeout(250);
};

// Source-canonical reconnection: dragging an edge's endpoint onto another node rewrites the endpoint in
// the source (`A --> B` becomes `A --> C`).
test("dragging an edge endpoint onto another node rewrites the source", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[A] --> B[B]\n  A --> C[C]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await dragToEndpointOnto(page, "C");
  expect(await sourceText(page)).toContain("A[A] --> C");
});

// A chained endpoint (`A --> B --> C` reuses the `B` token for two edges) is declined, since rewriting it
// would silently move the other edge too — never a silent corruption.
test("reconnecting a chained endpoint is declined (no silent corruption)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A --> B --> C\n  A --> D[D]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await sourceText(page);
  await dragToEndpointOnto(page, "D"); // edge0 is A-->B, whose B end is shared with B-->C
  expect(await sourceText(page)).toBe(before); // unchanged — declined
});

// Regression: releasing the endpoint back onto its OWN node (a change-of-mind drag, or a click since the
// handle sits on the node border) must NOT rewrite the endpoint — which would strip an inline label.
test("releasing an endpoint back onto its own node preserves the inline label", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[A] --> B[Important]\n  A --> C[C]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await sourceText(page);
  await dragToEndpointOnto(page, "B"); // drop the B-end back on B
  expect(await sourceText(page)).toBe(before); // B[Important] intact, no silent label loss
});
