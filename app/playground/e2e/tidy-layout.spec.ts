import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the Tidy toggle re-lays-out, announces, and persists across reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // A flowchart with a couple of cross-ish edges.
  await setSource(
    page,
    "flowchart TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n  A --> D\n  B --> C\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const styleSelect = page.locator("#layout-style");
  await expect(styleSelect).toHaveValue("tidy");

  await styleSelect.selectOption("classic");
  await expect(styleSelect).toHaveValue("classic");
  await expect(page.locator("#status")).toContainText(/layout style changed to classic/i);
  // The diagram still renders cleanly after the re-layout.
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Preference survives a reload.
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#layout-style")).toHaveValue("classic");

  // And toggles back.
  await page.locator("#layout-style").selectOption("tidy");
  await expect(page.locator("#layout-style")).toHaveValue("tidy");

  expect(errors).toEqual([]);
});
