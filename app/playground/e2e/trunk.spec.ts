import { expect, test } from "@playwright/test";
import { sourceValue } from "./support/source.js";

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

  // The dropdown tracks the CLOUD family for a cloud diagram (it used to lag one render behind and show
  // the previous family's options); trunk routing is the cloud default.
  const styleSelect = page.locator("#layout-style");
  await expect(styleSelect).toHaveValue("trunk");
  await styleSelect.selectOption("tidy");
  await expect(styleSelect).toHaveValue("tidy");
  expect(await sourceValue(page)).toBe(src); // a rendering option never edits the text
  await styleSelect.selectOption("trunk");
  await expect(styleSelect).toHaveValue("trunk");
  expect(errors).toEqual([]);
});
