import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const overrideCount = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("mermollusc-overlay");
    if (raw === null) return 0;
    return (JSON.parse(raw) as { overrides?: unknown[] }).overrides?.length ?? 0;
  });
const sourceValue = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");

declare global {
  interface Window {
    __editor?: { value(): string; setValue(text: string): void };
  }
}

// ⌘D duplicates the selected flowchart node(s): the default sample's `A[Start]` becomes a second
// `Start` node in the source, pinned just off the original (an override), and the copy is selected.
test("⌘D duplicates the selected node into the source and pins it nearby", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /flowchart diagram: 4 node/);

  const box = await page.locator("#stage").boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + 88, box.y + 56); // select the Start node

  await page.keyboard.press("ControlOrMeta+d");

  // the diagram now has a 5th node and the copy carries the original's "Start" label
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /flowchart diagram: 5 node/);
  expect((await sourceValue(page)).match(/Start/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  // the copy was placed via an override (pinned next to the original)
  await expect.poll(() => overrideCount(page)).toBe(1);

  expect(errors).toEqual([]);
});
