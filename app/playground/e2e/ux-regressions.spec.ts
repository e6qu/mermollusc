import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource, sourceValue } from "./support/source.js";

// Regression coverage for the 2026-07 UX audit fixes: keyboard Space on buttons, undoable example
// load / Add node, and share links not clobbering the visitor's persisted diagram.

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const undoChord = "Control+z";

test("Space activates a focused button instead of arming hand-pan", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const themeBtn = page.locator("#theme");
  const before = await page.locator("html").getAttribute("data-theme");
  await themeBtn.focus();
  await page.keyboard.press(" ");
  // Space must ACT like a click on the focused button — the theme flips.
  await expect
    .poll(() => page.locator("html").getAttribute("data-theme"))
    .not.toBe(before);
});

test("loading an example is one undoable step (text and layout come back)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  mine[My Node] --> yours[Your Node]\n");
  await expectSourceMatches(page, /My Node/);
  // Accept the replace confirmation (authored work is being swapped out).
  page.on("dialog", (d) => void d.accept());
  await page.locator("#example").selectOption({ label: "Sequence" });
  await expectSourceMatches(page, /sequenceDiagram/);
  // One ⌘Z restores the authored diagram — the promise the confirm dialog makes.
  await page.locator("#stage").click({ position: { x: 40, y: 40 } });
  await page.keyboard.press(undoChord);
  await expectSourceMatches(page, /My Node/);
});

test("Add node is a single undoable step", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  a[Start] --> b[End]\n");
  const before = await sourceValue(page);
  await page.locator("#add-node").click();
  await expect.poll(() => sourceValue(page)).not.toBe(before);
  await page.locator("#stage").click({ position: { x: 40, y: 40 } });
  await page.keyboard.press(undoChord);
  // Exactly the Add is undone — not the Add plus the edit before it.
  await expect.poll(() => sourceValue(page)).toBe(before);
});

test("opening a share link never overwrites the visitor's persisted diagram", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "flowchart TD\n  precious[Precious Work] --> safe[Safe]\n");
  await expectSourceMatches(page, /Precious Work/);
  // Simulate receiving someone else's share link: source arrives via the #src= hash. A hash-only
  // goto doesn't re-run the app, so reload to boot it the way a fresh visit would.
  const shared = encodeURIComponent("flowchart TD\n  theirs[Their Diagram] --> x[X]\n");
  await page.goto(`/#src=${shared}`);
  await page.reload();
  await expectSourceMatches(page, /Their Diagram/);
  // A plain revisit (no hash) must still show the visitor's own diagram, untouched.
  await page.goto("/");
  await expectSourceMatches(page, /Precious Work/);
});

test("a share link's &style= travels with the diagram but never overwrites the visitor's preference", async ({
  page,
}) => {
  const shared = encodeURIComponent("flowchart TD\n  a[One] --> b[Two]\n");
  await page.goto(`/#src=${shared}&style=tidy`);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // The sender's style applies to what they shared…
  await expect(page.locator("#layout-style")).toHaveValue("tidy");
  // …but a fresh visit without the link is back on the visitor's own default.
  await page.goto("/");
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#layout-style")).toHaveValue("classic");
});
