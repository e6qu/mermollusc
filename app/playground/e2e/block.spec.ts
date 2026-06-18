import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a block-beta diagram (grid + edge) from the textarea", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page,
    'block-beta\n  columns 2\n  a["Web"]\n  b["API"]\n  c["DB"]\n  a --> b\n  b --> c\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
