import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const edgeAccent = (page: Page, id: string) =>
  page.evaluate((e) => window.__edgeAccent?.(e) ?? null, id);
const sourceText = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");

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

// Source-canonical edge colour: for a flowchart, colouring an edge writes a Mermaid `linkStyle <index>
// stroke:…` directive into the SOURCE (edges are targeted by declaration index). It paints, the swatch
// reflects it, it survives a reload via the source, and clearing removes the directive.
test("a flowchart edge's colour is written to the source as a linkStyle directive", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[Alpha] --> B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const { id, screen } = await selectFirstEdge(page);
  const picker = page.locator("#ctx-colour-swatches");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("aria-label", "Edge color");
  await picker.locator('.swatch[data-accent="danger"]').click();

  // the colour is a Mermaid linkStyle directive in the source — no overlay accent
  await expect.poll(() => sourceText(page)).toContain("linkStyle 0 stroke:");
  expect(await edgeAccent(page, id)).toBe("none");

  // it paints — the reddest pixel near the edge midpoint is danger (#dc2626)
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

  // reselect: the swatch reflects the source colour
  await selectFirstEdge(page);
  await expect(picker.locator('.swatch[data-accent="danger"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // survives a reload (persisted in the source)
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => sourceText(page)).toContain("linkStyle 0 stroke:");

  // clearing removes the directive
  await selectFirstEdge(page);
  await picker.locator('.swatch[data-accent="none"]').click();
  await expect.poll(() => sourceText(page)).not.toContain("linkStyle");
});

// A family whose dialect we don't parse `linkStyle` for keeps the overlay edge accent (additive, not a
// fallback for Mermaid we can express).
// A family whose edges aren't in the shared `linkStyle` model (c4's relations) still colours an edge via
// the overlay accent. (The families with edge link-styling now write to the source; see below.)
test("a family without source edge-colour still colours an edge via the overlay accent", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, 'C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "uses")\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const { id } = await selectFirstEdge(page);
  await expect(page.locator("#ctx-colour-swatches")).toBeVisible();
  await page.locator('#ctx-colour-swatches .swatch[data-accent="active"]').click();
  await expect.poll(() => edgeAccent(page, id)).toBe("active");
  expect(await sourceText(page)).not.toContain("linkStyle");
});

// The write-side edge sweep: colouring an edge writes a `linkStyle <index> stroke:…` directive into the
// SOURCE for every family that carries edges + link styling (state/er/block/network/cloud/class), just
// like flowchart — targeting the edge by its declaration index, updating in place, clearing cleanly.
for (const fam of [
  { name: "state", source: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n" },
  { name: "er", source: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n" },
  { name: "block", source: "block-beta\n  columns 2\n  A B\n  A --> B\n" },
  { name: "network", source: 'network\n  server web1 "Web"\n  database db1 "DB"\n  web1 -- db1\n' },
  { name: "cloud", source: 'cloud\n  compute web1 "Web"\n  storage s1 "S3"\n  web1 --> s1\n' },
  { name: "class", source: "classDiagram\n  class Animal\n  class Dog\n  Animal <|-- Dog\n" },
]) {
  test(`a ${fam.name} edge's colour is written to the source as a linkStyle directive`, async ({
    page,
  }) => {
    await page.goto("/");
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
    await setSource(page, fam.source);
    await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

    await selectFirstEdge(page);
    const picker = page.locator("#ctx-colour-swatches");
    await expect(picker).toBeVisible();
    await picker.locator('.swatch[data-accent="danger"]').click();
    await expect.poll(() => sourceText(page)).toContain("linkStyle 0 stroke:");

    // re-colour updates in place — exactly one linkStyle 0 line
    await selectFirstEdge(page);
    await page.locator('#ctx-colour-swatches .swatch[data-accent="compute"]').click();
    await expect
      .poll(() => sourceText(page).then((t) => (t.match(/linkStyle 0 stroke:/g) ?? []).length))
      .toBe(1);

    // clearing removes the directive
    await selectFirstEdge(page);
    await page.locator('#ctx-colour-swatches .swatch[data-accent="none"]').click();
    await expect.poll(() => sourceText(page)).not.toContain("linkStyle 0 stroke:");
  });
}
