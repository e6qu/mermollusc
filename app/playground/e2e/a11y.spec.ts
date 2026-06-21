import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

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
  // The listbox mirrors the three nodes as options.
  await expect(nav.locator('[role="option"]')).toHaveCount(3);

  // Focusing activates the first node: aria-activedescendant points at it and the live region names it.
  await nav.focus();
  await expect(nav).toHaveAttribute("aria-activedescendant", "diagram-node-0");
  await expect(live).toHaveText(/, 1 of 3$/);

  // Arrow keys move the active node.
  await nav.press("ArrowDown");
  await expect(nav).toHaveAttribute("aria-activedescendant", "diagram-node-1");
  await expect(live).toHaveText(/, 2 of 3$/);
  const announced = (await live.textContent()) ?? "";
  const activeLabel = announced.split(",")[0] ?? "";
  expect(activeLabel.length).toBeGreaterThan(0);

  // The active node is the canvas selection, so Delete (with the listbox focused) removes it.
  await nav.press("Delete");
  await expect.poll(() => sourceValue(page)).not.toContain(activeLabel);
  await expect(live).toHaveText(/deleted 1 item/);
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
