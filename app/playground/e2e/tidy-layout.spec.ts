import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Classic Mermaid is the default; the opt-in Tidy style persists across reload", async ({
  page,
}) => {
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

  // The Mermaid-parity default: house styles are opt-in, never the out-of-the-box behavior.
  const styleSelect = page.locator("#layout-style");
  await expect(styleSelect).toHaveValue("classic");

  await styleSelect.selectOption("tidy");
  await expect(styleSelect).toHaveValue("tidy");
  await expect(page.locator("#status")).toContainText(/layout style changed to tidy/i);
  // The diagram still renders cleanly after the re-layout.
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Preference survives a reload.
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect(page.locator("#layout-style")).toHaveValue("tidy");

  // And toggles back.
  await page.locator("#layout-style").selectOption("classic");
  await expect(page.locator("#layout-style")).toHaveValue("classic");

  expect(errors).toEqual([]);
});
