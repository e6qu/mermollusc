import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const overrideCount = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return 0;
    const parsed = JSON.parse(raw) as { overrides?: unknown[] };
    return parsed.overrides?.length ?? 0;
  });

test("the diagram canvas exposes a text alternative for screen readers", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("role", "img");

  // A successful render summarises kind, counts, and node labels.
  await setSource(page, "flowchart TD\n  A[Start] --> B[Finish]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute(
    "aria-label",
    /flowchart diagram: 2 nodes, 1 edge\. Nodes: Start, Finish/,
  );

  // A parse error is announced rather than leaving a stale description.
  await setSource(page, "flowchart TD\n  A --> @@@\n");
  await expect(stage).toHaveAttribute("aria-label", /^Diagram error:/);
});

test("the diagram is keyboard-navigable: a node listbox drives selection, announcements, and Delete", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A[Alpha] --> B[Beta]\n  B --> C[Gamma]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const nav = page.locator("#diagram-nav");
  const live = page.locator("#diagram-live");
  // The listbox mirrors all three nodes plus the two edges as options.
  await expect(nav.locator('[role="option"]')).toHaveCount(5);

  // Focusing activates the first node: aria-activedescendant points at it and the live region names it
  // (label, position, and a spoken summary of its connections).
  await nav.focus();
  await expect(nav).toHaveAttribute("aria-activedescendant", "diagram-item-0");
  await expect(live).toHaveText(/, 1 of 5\. /);

  // Arrow keys move the active item.
  await nav.press("ArrowDown");
  await expect(nav).toHaveAttribute("aria-activedescendant", "diagram-item-1");
  await expect(live).toHaveText(/, 2 of 5\. /);
  const announced = (await live.textContent()) ?? "";
  const activeLabel = announced.split(",")[0] ?? "";
  expect(activeLabel.length).toBeGreaterThan(0);

  // The active node is the canvas selection, so Delete (with the listbox focused) removes it.
  await nav.press("Delete");
  await expect.poll(() => sourceValue(page)).not.toContain(activeLabel);
  await expect(live).toHaveText(/deleted 1 item/);
});

test("edges are first-class navigator targets: reachable, announced, relabel + delete", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Declare the nodes on their own lines so deleting the edge line leaves them intact.
  await setSource(page, "flowchart TD\n  A[Alpha]\n  B[Beta]\n  A -->|go| B\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const nav = page.locator("#diagram-nav");
  const live = page.locator("#diagram-live");
  // Two nodes + one edge = three options; the edge is the last one.
  await expect(nav.locator('[role="option"]')).toHaveCount(3);

  await nav.focus(); // node 0
  await nav.press("End"); // jump to the edge (last item)
  await expect(nav).toHaveAttribute("aria-activedescendant", "diagram-item-2");
  await expect(live).toHaveText(/Alpha to Beta.*edge, 3 of 3/);

  // Enter relabels the edge (its label span), writing back to the source.
  await nav.press("Enter");
  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("go");
  await editor.fill("retry");
  await editor.press("Enter");
  await expect.poll(() => sourceValue(page)).toContain("retry");

  // Re-focus the edge and Delete it: the arrow goes, the nodes stay.
  await nav.focus();
  await nav.press("End");
  await nav.press("Delete");
  await expect.poll(() => sourceValue(page)).not.toMatch(/-->/);
  await expect.poll(() => sourceValue(page)).toContain("Alpha");
});

test("the navigator separates navigation from movement: plain arrows navigate, Alt+arrow nudges", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A[Alpha] --> B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const nav = page.locator("#diagram-nav");
  await nav.focus();
  // Plain arrows only navigate — they must NOT move a node (no override written). Regression guard for
  // the double-fire where the global nudge also ran while the listbox was focused.
  await nav.press("ArrowDown");
  await nav.press("ArrowUp");
  expect(await overrideCount(page)).toBe(0);

  // Alt+Arrow nudges the active node → one override, and the live region confirms the move.
  await nav.press("Alt+ArrowRight");
  await expect.poll(() => overrideCount(page)).toBe(1);
  await expect(page.locator("#diagram-live")).toHaveText(/^moved /);
});

test("the navigator announces each node's connections (topology, not just labels)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A[Alpha] --> B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const nav = page.locator("#diagram-nav");
  const live = page.locator("#diagram-live");
  // Visit both nodes, collecting their spoken summaries (node order is the layout's, so don't assume it).
  await nav.focus();
  const heard: string[] = [(await live.textContent()) ?? ""];
  await nav.press("ArrowDown");
  heard.push((await live.textContent()) ?? "");

  const all = heard.join(" | ");
  expect(all).toContain("to Beta"); // Alpha's outgoing edge
  expect(all).toContain("from Alpha"); // Beta's incoming edge
});

test("two-step `c` connects the active node to a target from the keyboard", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Three bare nodes, no edges yet.
  await setSource(page, "flowchart TD\n  A[Alpha]\n  B[Beta]\n  C[Gamma]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const nav = page.locator("#diagram-nav");
  const live = page.locator("#diagram-live");
  await nav.focus(); // active node 0 (the source)

  await nav.press("c");
  await expect(live).toHaveText(/^connecting from .* press c$/);

  await nav.press("ArrowDown"); // move to a different node (the target)
  await nav.press("c");
  await expect(live).toHaveText(/^connected .* to .*$/);
  // an edge line now exists in the source (none did before)
  await expect.poll(() => sourceValue(page)).toMatch(/-->/);
});

test("Enter on the active node opens the inline relabel editor (keyboard parity)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  A[Alpha] --> B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const nav = page.locator("#diagram-nav");
  await nav.focus(); // activates the first node
  const label = ((await page.locator("#diagram-live").textContent()) ?? "").split(",")[0] ?? "";

  await nav.press("Enter");
  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(label); // seeded with the active node's label
  await editor.fill("Renamed");
  await editor.press("Enter");

  await expect.poll(() => sourceValue(page)).toContain("Renamed");
});

test("focusing the node navigator rings the stage (visible keyboard focus)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const stageWrap = page.locator("#stage-wrap");
  await expect(stageWrap).not.toHaveClass(/kbd-focus/);
  await page.locator("#diagram-nav").focus();
  await expect(stageWrap).toHaveClass(/kbd-focus/);
  // Moving focus away (to a toolbar button) drops the ring.
  await page.locator("#help-toggle").focus();
  await expect(stageWrap).not.toHaveClass(/kbd-focus/);
});

test("honours prefers-reduced-motion by collapsing animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Force an error so the status bar (which otherwise shakes via the `nudge` keyframes) is shown.
  await setSource(page, "flowchart TD\n  A --> @@@\n");
  const status = page.locator("#status");
  await expect(status).toHaveAttribute("data-level", "error");
  const animMs = await status.evaluate((el) => {
    const d = getComputedStyle(el).animationDuration;
    return d.endsWith("ms") ? Number.parseFloat(d) : Number.parseFloat(d) * 1000;
  });
  expect(animMs).toBeLessThan(1); // the shake is collapsed to ~0
});

test("every visible interactive control has an accessible name", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const unnamed = await page.evaluate(() => {
    const name = (el: Element): string =>
      (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
    return Array.from(document.querySelectorAll("button, select, a[href]"))
      .filter((el) => (el as HTMLElement).offsetParent !== null && name(el) === "")
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || "(no id)"}`);
  });
  expect(unnamed).toEqual([]);
});
