import { expect, test } from "@playwright/test";
import { sourceValue } from "./support/source.js";

// The opt-in "Trunk" rendering: the aggressive bus — each fan re-routes through a shared trunk + junctions.
test("Trunk toggle re-renders the architecture diagram without errors and never edits the source", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?example=cloud");
  await expect
    .poll(() => page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(0);
  const src = await sourceValue(page);

  const trunk = page.locator("#trunk");
  await expect(trunk).toHaveAttribute("aria-pressed", "false");
  await trunk.click();
  await expect(trunk).toHaveAttribute("aria-pressed", "true");
  expect(await sourceValue(page)).toBe(src); // a rendering option never edits the text
  await trunk.click();
  await expect(trunk).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
