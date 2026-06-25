import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, expectSourceNotMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("double-click a sequence actor relabels it in the source text", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "sequenceDiagram\n  participant A as Alice\n  A->>B: hi\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // First actor box sits at the origin; its centre is a deterministic hit point.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.dblclick(box.x + 56, box.y + 44);

  const editor = page.locator("#inline-edit");
  await expect(editor).toBeVisible();
  await editor.fill("Renamed");
  await editor.press("Enter");

  await expectSourceMatches(page, /as Renamed/);
});

test("a sequence note renders and is stripped when its target actor is deleted", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  const canvas = page.locator("#stage");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "sequenceDiagram\n  participant A\n  participant B\n  A->>B: hi\n  note over A,B: shared state\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // The note is a real scene node, so its text appears in the canvas's screen-reader description.
  await expect(canvas).toHaveAttribute("aria-label", /shared state/);

  // Deleting actor A removes the note anchored to it (the formerly-unreachable `SEQ_NOTE` branch).
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + 54, box.y + 42);
  await page.keyboard.press("Delete");

  await expectSourceNotMatches(page, /note over/);
  await expectSourceNotMatches(page, /participant A\b/);
  expect(errors).toEqual([]);
});
