import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Backspace in the icon-filter input edits the field, not the diagram", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // A network diagram so the icon picker is available (icon overrides apply to network/cloud/block).
  await setSource(page, 'network\n  server a "A"\n  server b "B"\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select everything, then edit the icon-picker filter — Backspace must not delete the selection.
  await page.locator("#stage").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.locator("#icons-toggle").click();
  const filter = page.locator("#icon-filter");
  await filter.click();
  await filter.fill("xyz");
  await filter.press("Backspace");

  // The source still has both nodes (nothing was deleted), and the field lost its last char.
  await expect(filter).toHaveValue("xy");
  await expect(page.locator("#status")).toContainText("2 nodes");
});

test("a missing icon does not grey out the (correctly rendered) canvas", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, 'network\n  server s "Box" icon "simpleicons/definitely-not-a-real-icon"\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The diagram rendered, so the stage is not marked stale (no grey-out), and the status is a warning
  // that still carries the node count — not an error.
  await expect(page.locator("#stage-wrap")).toHaveAttribute("data-stale", "false");
  await expect(page.locator("#status")).toContainText("icon(s) failed");
  await expect(page.locator("#status")).toContainText("node");
});

test("source replacement clears stale selection before commands run", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[Alpha] --> B[Beta]\n");
  await page.locator("#stage").click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.locator("#connect")).toBeEnabled();

  await setSource(page, "flowchart TD\n  X[Fresh] --> Y[Next]\n");
  await expect(page.locator("#connect")).toBeDisabled();
  await expect(page.locator("#group")).toBeDisabled();
});

test("exports and image copy are blocked while the current source is stale", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[Start] --> B[Done]\n");
  await setSource(page, "flowchart TD\n  A[Start --> ??? broken |\n");
  await expect(page.locator("#status")).toHaveAttribute("data-level", "error");

  // While the source doesn't render, the export/copy controls are disabled up front (with a "fix the
  // source first" title) rather than erroring only after a click.
  for (const id of ["#export-png", "#export-pdf", "#export-svg", "#export-dot", "#copy-png"]) {
    await expect(page.locator(id)).toBeDisabled();
    await expect(page.locator(id)).toHaveAttribute("title", /fix the source first/);
  }
  await expect(page.locator("#stage-wrap")).toHaveAttribute("data-stale", "true");
});

test("task guidance tracks valid, selected, edge, and stale states", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  const task = page.locator("#task-status-text");
  await expect(task).toContainText("select a diagram item");

  await page.locator("#diagram-nav").focus();
  await expect(task).toContainText("drag");
  await expect(task).toContainText("resize");

  await page.keyboard.press("End");
  await expect(task).toContainText("relabel this edge");
  await expect(page.locator("#stage-hud")).toBeVisible();

  await setSource(page, "flowchart TD\n  A[Start --> ??? broken |\n");
  await expect(task).toContainText("fix the source");
  await expect(page.locator("#stage-hud")).toBeVisible();
});

test("task guidance surfaces disabled action reasons without hover", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  const task = page.locator("#task-status-text");

  await setSource(page, "timeline\n  2001 : Alpha : Beta\n  2002 : Gamma\n");
  await expect(task).toContainText("Add: adding nodes isn't available for timeline");
  // Relax runs for 9 node-graph families; timeline isn't one, so the reason names the family
  // rather than the old (and, for e.g. state/cloud, wrong) "flowchart only" claim.
  await expect(task).toContainText("Relax: not available for timeline");
  await expect(task).toHaveCSS("white-space", "normal");

  await setSource(page, "gitGraph\n  commit\n  branch develop\n  commit\n  branch feature\n  commit\n");
  await expect(page.locator("#diagram-nav")).toContainText("main");
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("Home");
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");

  await expect(page.locator("#connect")).toBeDisabled();
  await expect(task).toContainText("Connect: select exactly two nodes");
  await expect(task).toContainText("Duplicate: duplicate isn't available for gitGraph");
});

test("transient confirmations refresh task guidance without replacing diagram status", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  const stage = page.locator("#stage");
  const task = page.locator("#task-status-text");

  await page.locator("#diagram-nav").focus();
  await expect(task).toContainText("Alt+arrows resize");
  await expect(stage).toHaveAttribute("aria-label", /^flowchart diagram:/);

  await page.locator("#relax").click();
  await expect(page.locator("#status")).toContainText("relaxed layout");
  await expect(task).toContainText("Alt+arrows resize");
  await expect(stage).toHaveAttribute("aria-label", /^flowchart diagram:/);
});
