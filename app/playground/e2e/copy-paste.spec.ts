import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const sourceValue = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");

declare global {
  interface Window {
    __editor?: { value(): string; setValue(text: string): void };
  }
}

// ⌘C copies the selected flowchart node(s) to an in-memory clipboard; ⌘V pastes fresh-id copies. Unlike
// ⌘D the clipboard persists, so a single copy can be pasted repeatedly — each paste cascades a bit.
test("⌘C / ⌘V copies a node and pastes it (repeatably)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /flowchart diagram: 4 node/);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + 88, box.y + 56); // select the Start node

  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");

  // one paste → a 5th node carrying the original's "Start" label
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /flowchart diagram: 5 node/);
  expect((await sourceValue(page)).match(/Start/g)?.length ?? 0).toBeGreaterThanOrEqual(2);

  // the clipboard persists — a second paste adds another (no re-copy needed)
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /flowchart diagram: 6 node/);
  expect((await sourceValue(page)).match(/Start/g)?.length ?? 0).toBeGreaterThanOrEqual(3);

  expect(errors).toEqual([]);
});
