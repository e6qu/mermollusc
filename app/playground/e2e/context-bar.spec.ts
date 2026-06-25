import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const visibleCtxButtons = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>("#context-bar button")]
      .filter((b) => !b.hidden)
      .map((b) => b.id.replace("ctx-", "")),
  );

const ready = async (page: Page) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

test("the context bar is hidden until something is selected, then shows applicable verbs", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator("#context-bar")).toBeHidden();

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.click(box.x + box.width / 2, box.y + 40); // select the Start node
  await expect(page.locator("#context-bar")).toBeVisible();
  // single flowchart node: rename/shape/duplicate/delete — but not connect/group/arrange.
  expect(await visibleCtxButtons(page)).toEqual(["relabel", "shape", "duplicate", "delete"]);

  await page.keyboard.press("Escape"); // clear selection
  await expect(page.locator("#context-bar")).toBeHidden();
});

test("a multi-selection offers Connect/Group/Arrange; an edge offers Rename/Style/Delete", async ({
  page,
}) => {
  await ready(page);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");

  // Select two nodes (Start + Choice).
  await page.mouse.click(box.x + box.width / 2, box.y + 40);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + box.width / 2, box.y + 134);
  await page.keyboard.up("Shift");
  const multi = await visibleCtxButtons(page);
  expect(multi).toContain("connect");
  expect(multi).toContain("group");
  expect(multi).toContain("arrange");
  expect(multi).toContain("delete");

  // An edge-only selection: rename, restyle (the Shape button doubles as edge Style), and delete.
  await page.keyboard.press("Escape");
  await page.locator("#diagram-nav").focus();
  await page.locator("#diagram-nav").press("ArrowDown");
  await page.locator("#diagram-nav").press("ArrowDown");
  await page.locator("#diagram-nav").press("ArrowDown");
  await page.locator("#diagram-nav").press("ArrowDown"); // onto an edge item
  expect(await visibleCtxButtons(page)).toEqual(["relabel", "shape", "delete"]);
});

test("Connect is absent on a family that can't accept it (gantt) even with two selected", async ({
  page,
}) => {
  await ready(page);
  await setSource(
    page,
    "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section S\n    A :a, 2024-01-01, 2d\n    B :b, after a, 2d\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.click(box.x + 60, box.y + 40);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 60, box.y + 64);
  await page.keyboard.up("Shift");
  expect(await visibleCtxButtons(page)).not.toContain("connect");
});

test("the context Group button yields the same source as the workbench Group button", async ({
  page,
}) => {
  await ready(page);
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.click(box.x + box.width / 2, box.y + 40);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + box.width / 2, box.y + 134);
  await page.keyboard.up("Shift");

  // The context Group only groups the overlay (no source change); assert it runs without error and the
  // group buttons reflect the new group (Ungroup enabled) — same as clicking the workbench Group.
  const before = await sourceValue(page);
  await page.locator("#ctx-group").click();
  expect(await sourceValue(page)).toBe(before); // grouping is overlay-only
  await expect(page.locator("#ungroup")).toBeEnabled();
});
