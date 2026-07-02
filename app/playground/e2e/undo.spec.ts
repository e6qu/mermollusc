import { expect, test, type Page } from "@playwright/test";
import { clickNode, dragNodeBy, nodeCenter } from "./support/nodes.js";
import { sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
// The number of position overrides currently persisted (0 when none).
const overrideCount = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return 0;
    const parsed = JSON.parse(raw) as { overrides?: unknown[] };
    return parsed.overrides?.length ?? 0;
  });

// Select the default flowchart's Start node, then shift-add the Choice node below it.
const selectPair = async (page: Page) => {
  await clickNode(page, "A");
  await page.keyboard.down("Shift");
  await clickNode(page, "B");
  await page.keyboard.up("Shift");
};

test("⌘Z undoes a node drag and ⌘⇧Z redoes it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  expect(await overrideCount(page)).toBe(0);

  await dragNodeBy(page, "A", 212, 184);
  await expect.poll(() => overrideCount(page)).toBe(1); // the drag wrote a position override

  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideCount(page)).toBe(0); // back to where we started

  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => overrideCount(page)).toBe(1); // redo reinstates the move

  expect(errors).toEqual([]);
});

test("undoing a drag restores the position without touching unchanged source text", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const textBefore = await sourceValue(page);
  // Drag a node → one overlay override (the editor text is unchanged by a drag).
  await dragNodeBy(page, "A", 192, 164);
  await expect.poll(() => overrideCount(page)).toBe(1);
  expect(await sourceValue(page)).toBe(textBefore);

  // ⌘Z undoes the drag from the unified history; the entry's text equals the current text (a drag never
  // edits the source), so restoring it is a no-op on the editor.
  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideCount(page)).toBe(0);
  expect(await sourceValue(page)).toBe(textBefore);
});

test("⌘Z undoes a Group", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await selectPair(page);
  await page.locator("#group").click();
  await expect(page.locator("#ungroup")).toBeEnabled(); // a group exists

  await page.keyboard.press("Control+z");
  await expect(page.locator("#ungroup")).toBeDisabled(); // group undone

  expect(errors).toEqual([]);
});

test("unifying undo/redo history coordinates text typing, node dragging, and programmatic edits in one stack", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const initialText = await sourceValue(page);

  // 1. Focus editor and type a node label update
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("flowchart TD\n  Start --> Choice\n  Choice -->|yes| Result1\n  Choice -->|no| Result2\n  Extra[Extra]\n");
  await expect.poll(() => sourceValue(page)).toContain("Extra");
  // Let the debounce/typing timer clear
  await page.waitForTimeout(1000);

  // 2. Drag node Choice on the canvas
  expect(await overrideCount(page)).toBe(0);
  const choiceCenter = await nodeCenter(page, "Choice");
  await page.mouse.move(choiceCenter.x, choiceCenter.y);
  await page.mouse.down();
  await page.mouse.move(choiceCenter.x + 200, choiceCenter.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => overrideCount(page)).toBe(1);

  // 3. Connect Start to Result1 (programmatic edit)
  const startCenter = await nodeCenter(page, "Start");
  await page.mouse.click(startCenter.x, startCenter.y); // select Start
  await page.keyboard.down("Shift");
  const result1Center = await nodeCenter(page, "Result1");
  await page.mouse.click(result1Center.x, result1Center.y); // select Result1
  await page.keyboard.up("Shift");
  const connectBtn = page.locator("#ctx-connect");
  await expect(connectBtn).toBeEnabled();
  await connectBtn.click();
  // An edge line should now be appended
  await expect.poll(() => sourceValue(page)).toMatch(/Start --> Result1/);

  // --- UNDO ---
  // Undo 1: should undo the Connect
  await page.keyboard.press("Control+z");
  await expect.poll(() => sourceValue(page)).not.toMatch(/Start --> Result1/);
  await expect.poll(() => overrideCount(page)).toBe(1);

  // Undo 2: should undo the Drag
  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideCount(page)).toBe(0);

  // Undo 3: should undo the Typing (back to initialText)
  await page.keyboard.press("Control+z");
  await expect.poll(() => sourceValue(page)).toBe(initialText);
});
