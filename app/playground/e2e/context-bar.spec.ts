import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const visibleCtxButtons = (page: Page) =>
  page.evaluate(() => {
    const list = [];
    for (const el of document.querySelectorAll("#context-bar > button, #context-bar > div")) {
      const html = el as HTMLElement;
      if (html.hidden) continue;
      const name = html.id.replace("ctx-", "");
      if (name === "colour-swatches") {
        list.push("colour");
      } else {
        list.push(name);
      }
    }
    return list;
  });

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
  // single flowchart node: rename/shape/colour/connect/duplicate/pin/group/arrange/delete
  expect(await visibleCtxButtons(page)).toEqual([
    "relabel",
    "shape",
    "colour",
    "connect",
    "duplicate",
    "pin",
    "group",
    "arrange",
    "delete",
  ]);

  await page.keyboard.press("Escape"); // clear selection
  await expect(page.locator("#context-bar")).toBeHidden();
});

test("a multi-selection offers Connect/Group/Arrange; an edge offers Rename/Style/Curve/Delete", async ({
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

  // An edge-only selection: rename, restyle (the Shape button doubles as edge Style), colour the stroke,
  // curve, reroute, and delete.
  await page.keyboard.press("Escape");
  await page.locator("#diagram-nav").focus();
  await page.locator("#diagram-nav").press("ArrowDown");
  await page.locator("#diagram-nav").press("ArrowDown");
  await page.locator("#diagram-nav").press("ArrowDown");
  await page.locator("#diagram-nav").press("ArrowDown"); // onto an edge item
  expect(await visibleCtxButtons(page)).toEqual([
    "relabel",
    "shape",
    "colour",
    "curve",
    "reroute",
    "delete",
  ]);
});

test("Rename is offered only for items that actually have an editable label", async ({ page }) => {
  await ready(page);
  // Mindmap NODES relabel through their source span; the spokes (edges) have no label at all — so Rename
  // must appear for the nodes and be absent for the spokes, instead of being offered and then failing.
  await setSource(page, "mindmap\n  root((Root))\n    A[Alpha]\n    B[Beta]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const nav = page.locator("#diagram-nav");
  await nav.focus();
  let sawNode = false;
  let sawSpoke = false;
  for (let i = 0; i < 8; i++) {
    await nav.press("ArrowDown");
    const btns = await visibleCtxButtons(page);
    if (btns.includes("connect")) {
      sawNode = true;
      expect(btns, "a mindmap node has an editable label").toContain("relabel");
    } else if (btns.includes("reroute")) {
      sawSpoke = true;
      expect(btns, "a mindmap spoke has no editable label").not.toContain("relabel");
    }
  }
  expect(sawNode && sawSpoke, "navigated both a node and a spoke").toBe(true);
});

test("Reroute cycles a bounded set of alternatives and returns to the original route", async ({
  page,
}) => {
  await ready(page);
  const nav = page.locator("#diagram-nav");
  await nav.focus();
  for (let i = 0; i < 4; i++) await nav.press("ArrowDown"); // onto an edge
  const btn = page.locator("#ctx-reroute");
  await expect(btn).toBeVisible();

  let sawAlternative = false;
  let wrappedToOriginal = false;
  let maxOption = 0;
  for (let i = 0; i < 24 && !wrappedToOriginal; i++) {
    await btn.click();
    const label = (await btn.textContent())?.trim() ?? "";
    const m = label.match(/^Reroute \((\d+)\)$/);
    if (m?.[1] !== undefined) {
      sawAlternative = true;
      maxOption = Math.max(maxOption, Number(m[1]));
    } else if (sawAlternative && label === "Reroute") {
      wrappedToOriginal = true; // cycled past the last alternative back to the original route
    }
  }
  expect(sawAlternative, "offered at least one alternative route").toBe(true);
  expect(wrappedToOriginal, "returns to the original route within one cycle (not an unbounded counter)").toBe(
    true,
  );
  expect(maxOption, "the alternative set is bounded").toBeLessThan(40);
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

  // Flowchart grouping is source-canonical (writes a `subgraph` block), so the context Group button —
  // like the workbench Group — changes the source and enables Ungroup.
  const before = await sourceValue(page);
  await page.locator("#ctx-group").click();
  const after = await sourceValue(page);
  expect(after).not.toBe(before);
  expect(after).toContain("subgraph");
  await expect(page.locator("#ungroup")).toBeEnabled();
});
