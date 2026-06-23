import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const scrollTopOf = (page: Page) =>
  page.locator("#stage-wrap").evaluate((el) => el.scrollTop);

// A 2-D DAG that overflows the stage once zoomed in.
const DIAMOND =
  "flowchart TD\n  A-->B\n  A-->C\n  B-->D\n  C-->D\n  D-->E\n  D-->F\n  E-->G\n  F-->G\n  G-->H\n  G-->I\n";

const zoomIn = async (page: Page, times: number) => {
  for (let i = 0; i < times; i++) await page.locator("#zoom-in").click();
};

test("the minimap stays hidden while the diagram fits the stage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Default sample is small and fits at 100% — no overview needed.
  await expect(page.locator("#minimap")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the minimap appears when the sheet overflows and hides again when it fits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await zoomIn(page, 4);
  await expect(page.locator("#minimap")).toBeVisible();

  await page.locator("#zoom-fit").click();
  await expect(page.locator("#minimap")).toBeHidden();
  expect(errors).toEqual([]);
});

test("clicking near the bottom of the minimap scrolls the stage down", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await setSource(page, DIAMOND);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await zoomIn(page, 4);
  await expect(page.locator("#minimap")).toBeVisible();
  expect(await scrollTopOf(page)).toBe(0);

  const box = await page.locator("#minimap").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);

  expect(await scrollTopOf(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("dragging within the minimap pans the stage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await setSource(page, DIAMOND);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await zoomIn(page, 4);
  await expect(page.locator("#minimap")).toBeVisible();

  const box = await page.locator("#minimap").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.move(box.x + box.width / 2, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 6);
  await page.mouse.up();

  expect(await scrollTopOf(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the minimap can pan the stage from the keyboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await setSource(page, DIAMOND);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await zoomIn(page, 4);
  const minimap = page.locator("#minimap");
  await expect(minimap).toBeVisible();
  await minimap.focus();
  await expect(minimap).toBeFocused();

  await page.keyboard.press("ArrowDown");
  expect(await scrollTopOf(page)).toBeGreaterThan(0);
  await page.keyboard.press("Home");
  expect(await scrollTopOf(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("the minimap recalculates overflow after viewport resize", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#minimap")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#minimap")).toBeVisible();
  expect(errors).toEqual([]);
});
