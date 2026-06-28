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

  const styleSelect = page.locator("#layout-style");
  await expect(styleSelect).toHaveValue("tidy");
  await styleSelect.selectOption("trunk");
  await expect(styleSelect).toHaveValue("trunk");
  expect(await sourceValue(page)).toBe(src); // a rendering option never edits the text
  await styleSelect.selectOption("tidy");
  await expect(styleSelect).toHaveValue("tidy");
  expect(errors).toEqual([]);
});
