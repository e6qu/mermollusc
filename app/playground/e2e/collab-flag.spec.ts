import { expect, test, type Page } from "@playwright/test";
import { collabUrl } from "./collab-url.js";

// The `?collab` flag swaps the local overlay document for the Yjs-backed one (`@m/collab`). It is the
// same `OverlayDoc` interface, so the whole app must behave identically: a drag still writes a
// position override (persisted through the injected save sink → localStorage) and ⌘Z still undoes it.
// This proves the CRDT document drives the real app, end to end, with no peer wired.

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const overrideCount = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return 0;
    const parsed = JSON.parse(raw) as { overrides?: unknown[] };
    return parsed.overrides?.length ?? 0;
  });

test("?collab runs the Yjs overlay: drag persists and ⌘Z undoes it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(collabUrl("smoke"));
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  expect(await overrideCount(page)).toBe(0);

  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 240, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => overrideCount(page)).toBe(1); // the Yjs overlay recorded the move

  await page.screenshot({ path: "shots/collab-flag-drag.png" });

  await page.keyboard.press("Control+z");
  await expect.poll(() => overrideCount(page)).toBe(0); // Y.UndoManager reverted it

  expect(errors).toEqual([]);
});
