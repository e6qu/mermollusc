import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const edgeAccent = (page: Page, id: string) =>
  page.evaluate((e) => window.__edgeAccent?.(e) ?? null, id);

// Select the first shown edge by clicking its geometric midpoint (clear of the endpoints/nodes) and
// return its id + the on-screen midpoint (for a later pixel probe).
const selectFirstEdge = async (
  page: Page,
): Promise<{ id: string; screen: { x: number; y: number } }> => {
  const edges = await page.evaluate(() => window.__shownEdges?.() ?? []);
  const e0 = edges[0];
  if (e0 === undefined) throw new Error("no edge");
  const a = e0.waypoints[0];
  const b = e0.waypoints[e0.waypoints.length - 1];
  if (a === undefined || b === undefined) throw new Error("edge has no waypoints");
  const screen = await page.evaluate((p) => window.__sceneToScreen?.(p.x, p.y) ?? null, {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  if (screen === null) throw new Error("no screen mapping");
  await page.mouse.click(screen.x, screen.y);
  return { id: e0.id, screen };
};

test("an edge's colour is set from the swatch picker, paints, and persists", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[Alpha] --> B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const { id, screen } = await selectFirstEdge(page);
  // the picker appears for an edge selection, labelled for edges, with the full palette
  const picker = page.locator("#ctx-colour-swatches");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("aria-label", "Edge color");
  await expect(picker.locator(".swatch")).toHaveCount(9);

  await picker.locator('.swatch[data-accent="danger"]').click();
  await expect.poll(() => edgeAccent(page, id)).toBe("danger");

  // it actually paints — sample the reddest pixel near the edge midpoint (danger ≈ #dc2626)
  await page.keyboard.press("Escape");
  const px = await page.evaluate((p) => {
    const c = document.querySelector("#stage");
    if (!(c instanceof HTMLCanvasElement)) return [0, 0, 0, 0];
    const rect = c.getBoundingClientRect();
    const ctx = c.getContext("2d");
    if (ctx === null) return [0, 0, 0, 0];
    const x = Math.round((p.x - rect.left) * (c.width / rect.width));
    const y = Math.round((p.y - rect.top) * (c.height / rect.height));
    let best = [0, 0, 0, 0];
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const d = ctx.getImageData(x + dx, y + dy, 1, 1).data;
        const [r = 0, g = 0, b = 0] = [d[0], d[1], d[2]];
        const [br = 0] = best;
        if (r > br && r > g && r > b) best = [r, g, b, d[3] ?? 0];
      }
    return best;
  }, screen);
  expect(px[0] ?? 0).toBeGreaterThan(150);
  expect(px[1] ?? 255).toBeLessThan(120);

  // the colour survives a reload (persisted in the overlay)
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => edgeAccent(page, id)).toBe("danger");
});
