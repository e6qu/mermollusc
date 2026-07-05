import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const accent = (page: Page, id: string) =>
  page.evaluate((n) => window.__nodeAccent?.(n) ?? null, id);
const sourceText = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");

const selectNode = async (page: Page, id: string): Promise<void> => {
  const r = await page.evaluate((n) => window.__nodeRect?.(n) ?? null, id);
  if (r === null) throw new Error(`no node ${id}`);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
};

// Source-canonical node colour: for a flowchart, colouring a node writes a Mermaid `style <id> fill:…`
// directive into the SOURCE (not the overlay), because the source is the single source of truth for
// anything Mermaid can express. The swatch reflects that colour, it survives a reload via the source,
// and clearing removes the directive.
test("a flowchart node's colour is written to the source as a style directive", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[A] --> B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectNode(page, "A");
  const swatches = page.locator("#ctx-colour-swatches");
  await expect(swatches).toBeVisible();
  await expect(swatches).toHaveAttribute("role", "radiogroup");
  await page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]').click();

  // the colour is now a Mermaid style directive in the source — no overlay accent, no invented syntax
  await expect.poll(() => sourceText(page)).toContain("style A fill:");
  expect(await accent(page, "A")).toBe("none"); // the overlay is NOT used for a flowchart colour

  // reselect: the swatch reflects the source colour
  await selectNode(page, "A");
  await expect(page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // survives a reload (persisted in the source itself)
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect.poll(() => sourceText(page)).toContain("style A fill:");

  // clearing removes the directive entirely (leaves valid Mermaid, no blank line)
  await selectNode(page, "A");
  await page.locator('#ctx-colour-swatches .swatch[data-accent="none"]').click();
  await expect.poll(() => sourceText(page)).not.toContain("style A fill:");
});

test("the swatch surfaces all nine accents; an architecture accent writes to the source", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[A] --> B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectNode(page, "A");
  await expect(page.locator("#ctx-colour-swatches .swatch")).toHaveCount(9);
  for (const acc of ["compute", "data", "network", "security", "ops"]) {
    await expect(page.locator(`#ctx-colour-swatches .swatch[data-accent="${acc}"]`)).toBeVisible();
  }
  await page.locator('#ctx-colour-swatches .swatch[data-accent="security"]').click();
  await expect.poll(() => sourceText(page)).toContain("style A fill:");
  await selectNode(page, "A");
  await expect(page.locator('#ctx-colour-swatches .swatch[data-accent="security"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

// A family whose Mermaid dialect we don't (yet) parse `style` for keeps the overlay accent — the overlay
// is an additive layer for these, not a fallback for Mermaid we can express. (State goes through the
// flowchart engine but is `kind: "state"`, so it takes the overlay path.)
// A family whose write-side (style-span capture) hasn't landed yet still colours via the overlay accent.
// (Flowchart and state write to the source; the rest are migrated to source as their spans land.)
test("a family without source-colour write yet still colours via the overlay accent", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectNode(page, "CUSTOMER");
  await expect(page.locator("#ctx-colour-swatches")).toBeVisible();
  await page.locator('#ctx-colour-swatches .swatch[data-accent="active"]').click();
  await expect.poll(() => accent(page, "CUSTOMER")).toBe("active");
  // no `style` text is written for a family whose source-write isn't wired yet
  expect(await sourceText(page)).not.toContain("style");
});

// Source-canonical node colour extends beyond flowchart: a state diagram is also fully Mermaid-
// expressible, so colouring a state writes a `style <id> fill:…` directive into the SOURCE (not the
// overlay), updates it in place on re-colour (no duplicate lines), and clears it cleanly.
test("a state node's colour is written to the source as a style directive", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectNode(page, "Idle");
  await expect(page.locator("#ctx-colour-swatches")).toBeVisible();
  await page.locator('#ctx-colour-swatches .swatch[data-accent="danger"]').click();
  await expect.poll(() => sourceText(page)).toContain("style Idle fill:");
  expect(await accent(page, "Idle")).toBe("none"); // source, not overlay

  // re-colour updates in place — exactly one style line for Idle, not two
  await selectNode(page, "Idle");
  await page.locator('#ctx-colour-swatches .swatch[data-accent="compute"]').click();
  await expect
    .poll(() => sourceText(page).then((t) => (t.match(/style Idle fill:/g) ?? []).length))
    .toBe(1);

  // clearing removes the directive entirely
  await selectNode(page, "Idle");
  await page.locator('#ctx-colour-swatches .swatch[data-accent="none"]').click();
  await expect.poll(() => sourceText(page)).not.toContain("style Idle fill:");
});
