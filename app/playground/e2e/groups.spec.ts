import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Select the default flowchart's Start node, then shift-add the Choice node below it.
const selectPair = async (page: Page, box: { x: number; y: number }) => {
  await page.mouse.click(box.x + 88, box.y + 56);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 88, box.y + 150);
  await page.keyboard.up("Shift");
};

const dragRight = async (page: Page, box: { x: number; y: number }) => {
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 430, box.y + 70, { steps: 8 });
  await page.mouse.up();
};

test("Group bundles the selection and toggles the controls; Ungroup reverses it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await expect(page.locator("#group")).toBeDisabled(); // nothing selected
  await selectPair(page, box);
  await expect(page.locator("#group")).toBeEnabled();

  await page.locator("#group").click();
  await expect(page.locator("#group")).toBeDisabled(); // now one unit
  await expect(page.locator("#ungroup")).toBeEnabled();
  await expect(page.locator("#lock")).toBeEnabled();
  await expect(page.locator("#lock")).toHaveText("Lock");

  await page.locator("#ungroup").click();
  await expect(page.locator("#ungroup")).toBeDisabled();
  await expect(page.locator("#group")).toBeEnabled(); // selection retained, regroupable

  expect(errors).toEqual([]);
});

test("a locked group can't be dragged; unlocking restores the move", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await selectPair(page, box);
  await page.locator("#group").click();
  await page.locator("#lock").click();
  await expect(page.locator("#lock")).toHaveText("Unlock");

  const locked = await canvasWidth(page);
  await dragRight(page, box); // locked → ignored, sheet doesn't grow
  expect(await canvasWidth(page)).toBe(locked);

  await page.locator("#lock").click(); // unlock
  await dragRight(page, box); // now the whole group moves → sheet grows
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(locked);

  expect(errors).toEqual([]);
});

test("clicking a group outline selects the whole group", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await selectPair(page, box);
  await page.locator("#group").click();
  await page.mouse.click(box.x + box.width - 8, box.y + box.height - 8);
  await expect(page.locator("#ungroup")).toBeDisabled();

  await page.mouse.click(box.x + 88, box.y + 30);
  await expect(page.locator("#ungroup")).toBeEnabled();
  await expect(page.locator("#lock")).toBeEnabled();
  await expect(page.locator("#group")).toBeDisabled();

  expect(errors).toEqual([]);
});

test("double-clicking a group outline edits its label", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await selectPair(page, box);
  await page.locator("#group").click();
  await page.mouse.dblclick(box.x + 88, box.y + 34);
  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Core flow");
  await page.keyboard.press("Enter");

  const overlay = await page.evaluate(() => localStorage.getItem("mermollusc-overlay"));
  expect(overlay).not.toBeNull();
  expect(overlay).toContain("Core flow");
  expect(errors).toEqual([]);
});

test("a group is pruned when its nodes leave the source (no stale resurrection)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await selectPair(page, box);
  await page.locator("#group").click();
  await expect(page.locator("#ungroup")).toBeEnabled();

  // Edit to a diagram without the grouped nodes — the sidecar group must not survive.
  await setSource(page, "flowchart TD\n  X --> Y\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#ungroup")).toBeDisabled();
  const groupCount = await page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    return raw === null ? 0 : (JSON.parse(raw).groups ?? []).length;
  });
  expect(groupCount).toBe(0);

  expect(errors).toEqual([]);
});

test("keyboard: Shift+Arrow multi-selects in the navigator and `g`/`u` group/ungroup", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const groupCount = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem("mermollusc-overlay");
      return raw === null ? 0 : ((JSON.parse(raw) as { groups?: unknown[] }).groups?.length ?? 0);
    });

  // Focus the diagram navigator (selects the first node), Shift+Down to add the second, then `g`.
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator("#ungroup")).toBeDisabled();
  expect(await groupCount()).toBe(0);

  await page.keyboard.press("g");
  await expect.poll(() => groupCount()).toBe(1); // a group was created from the keyboard selection
  await expect(page.locator("#ungroup")).toBeEnabled();

  await page.keyboard.press("u");
  await expect.poll(() => groupCount()).toBe(0); // and ungrouped
});
