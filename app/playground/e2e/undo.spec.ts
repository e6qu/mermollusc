import { expect, test, type Page } from "@playwright/test";
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

const nodeCenter = (page: Page, nodeId: string) =>
  page.evaluate((id) => {
    const rect = (window as any).__nodeRect(id);
    if (rect === null) throw new Error(`node not found: ${id}`);
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }, nodeId);

// Select the default flowchart's Start node, then shift-add the Choice node below it.
const selectPair = async (page: Page, box: { x: number; y: number }) => {
  await page.mouse.click(box.x + 88, box.y + 56);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 88, box.y + 150);
  await page.keyboard.up("Shift");
};

test("⌘Z undoes a node drag and ⌘⇧Z redoes it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  expect(await overrideCount(page)).toBe(0);

  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 240, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => overrideCount(page)).toBe(1); // the drag wrote a position override

  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideCount(page)).toBe(0); // back to where we started

  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => overrideCount(page)).toBe(1); // redo reinstates the move

  expect(errors).toEqual([]);
});

test("canvas ⌘Z drives the overlay history only, never the source text", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;

  const textBefore = await sourceValue(page);
  // Drag a node → one overlay override (the editor text is unchanged by a drag).
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 280, box.y + 220, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => overrideCount(page)).toBe(1);
  expect(await sourceValue(page)).toBe(textBefore);

  // ⌘Z with focus outside the editor undoes the drag (overlay history), leaving the text untouched —
  // the two histories are independent.
  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideCount(page)).toBe(0);
  expect(await sourceValue(page)).toBe(textBefore);
});

test("⌘Z undoes a Group", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await selectPair(page, box);
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
