import { expect, test } from "@playwright/test";
import { sourceValue } from "./support/source.js";

// The opt-in "Bus" rendering: a display-only re-route to shared backbones + junction dots, no source edit.
test("Bus toggle re-renders the architecture diagram without errors and never edits the source", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?example=cloud");
  await expect
    .poll(() => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(0);
  const src = await sourceValue(page);

  const bus = page.locator("#bus");
  await expect(bus).toHaveAttribute("aria-pressed", "false");
  await bus.click();
  await expect(bus).toHaveAttribute("aria-pressed", "true");
  // A rendering option never edits the diagram text.
  expect(await sourceValue(page)).toBe(src);
  await bus.click();
  await expect(bus).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
