import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";
import { watchPipelineErrors } from "./support/render.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Stage 1 of subgraph support: the parser understands `subgraph … end`, so the pipeline must render
// it without error (nodes lay out flat for now — container grouping comes when layout consumes the
// subgraph data).
test("renders a flowchart with a subgraph end to end without errors", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n",
  );
  // The aria-label names the parsed nodes, so this can't pass on the lingering default sample (which
  // has Start/Choice/Process/End) — it proves the new diagram actually rendered.
  await expect(page.locator("#stage")).toHaveAttribute(
    "aria-label",
    /flowchart diagram.*\bAPI\b.*\bDB\b/,
  );
  await expect(page.locator("#kind")).toHaveText("flowchart");
  expect(errors).toEqual([]);
});

// The number of position overrides currently persisted (0 when none).
const overrideCount = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    return raw === null ? 0 : ((JSON.parse(raw) as { overrides?: unknown[] }).overrides?.length ?? 0);
  });

test("moving a subgraph carries its nested nodes as one", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(
    page,
    "flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select the subgraph container in the keyboard navigator (deterministic, no coordinate guessing).
  await page.locator("#diagram-nav").focus();
  let label = "";
  for (let i = 0; i < 12 && !label.includes("Backend"); i++) {
    label = await page.evaluate(() => {
      const ad = document.querySelector("#diagram-nav")?.getAttribute("aria-activedescendant");
      return ad === null || ad === undefined ? "" : (document.getElementById(ad)?.textContent ?? "");
    });
    if (!label.includes("Backend")) await page.keyboard.press("ArrowDown");
  }
  expect(label).toContain("Backend");

  expect(await overrideCount(page)).toBe(0);
  for (let i = 0; i < 8; i++) await page.keyboard.press("Alt+ArrowRight");
  // The container plus both nested nodes (api, db) each get a position override — they moved together.
  await expect.poll(() => overrideCount(page)).toBe(3);
});

// Every segment of a route is axis-aligned within a small tolerance.
const everyEdgeOrthogonal = (page: Page) =>
  page.evaluate(() => {
    const edges = window.__shownEdges?.() ?? [];
    return edges.every((e) =>
      e.waypoints.every((p, i) => {
        if (i === 0) return true;
        const q = e.waypoints[i - 1];
        return q === undefined || Math.abs(p.x - q.x) < 1 || Math.abs(p.y - q.y) < 1;
      }),
    );
  });

test("moving a node re-routes its boundary-crossing connector to clean right angles", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(
    page,
    "flowchart TD\n  subgraph Backend\n    api[API] --> db[DB]\n  end\n  user[User] --> api\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(await everyEdgeOrthogonal(page)).toBe(true); // ELK routes are orthogonal to begin with

  // Move just `api` (navigator order: Backend, api, db, user). A blended move would leave the
  // user→api edge diagonal; the display-time re-tidy snaps it back to right angles.
  await page.locator("#diagram-nav").focus();
  let label = "";
  for (let i = 0; i < 12 && !label.includes("API"); i++) {
    label = await page.evaluate(() => {
      const ad = document.querySelector("#diagram-nav")?.getAttribute("aria-activedescendant");
      return ad === null || ad === undefined ? "" : (document.getElementById(ad)?.textContent ?? "");
    });
    if (!label.includes("API")) await page.keyboard.press("ArrowDown");
  }
  expect(label).toContain("API");
  for (let i = 0; i < 14; i++) await page.keyboard.press("Alt+ArrowRight");

  // All connectors remain orthogonal after the move (the crossing user→api edge didn't go diagonal).
  await expect.poll(() => everyEdgeOrthogonal(page)).toBe(true);
});
