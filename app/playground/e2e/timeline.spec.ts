import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a timeline (title, sections, periods, events) from the textarea", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "timeline\n  title History\n  section Early\n    2002 : LinkedIn\n    2004 : Facebook : Google\n  section Growth\n    2006 : Twitter\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^timeline diagram:/);
  await expect(page.locator("#kind")).toHaveText("timeline");
  expect(errors).toEqual([]);
});

test("the Timeline example loads and parses", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#example").selectOption("timeline");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("timeline");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0); // parsed cleanly

  expect(errors).toEqual([]);
});

test("dragging a timeline event keeps the diagram interactive and moves the rendered node", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "timeline\n  title Claims\n  FNOL : Reported : Assigned\n  Review : Estimate\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const before = await page.evaluate(() => window.__nodeRect?.("e1") ?? null);
  expect(before).not.toBeNull();
  if (before === null) return;
  await page.mouse.move(before.x + before.w / 2, before.y + before.h / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.w / 2 + 40, before.y + before.h / 2 + 24, { steps: 6 });
  await page.mouse.up();

  const after = await page.evaluate(() => window.__nodeRect?.("e1") ?? null);
  expect(after).not.toBeNull();
  if (after !== null) {
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
  }
  await expect(page.locator("#status")).not.toHaveAttribute("data-level", "error");
});

test("a continuation `:` before any period surfaces a lint error", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "timeline\n  : orphan\n");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(1);
});
