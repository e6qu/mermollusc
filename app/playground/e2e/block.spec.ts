import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a block-beta diagram (grid + edge) from the textarea", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page,
    'block-beta\n  columns 2\n  a["Web"]\n  b["API"]\n  c["DB"]\n  a --> b\n  b --> c\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // A parse/layout break wouldn't repaint (the prior render lingers), so assert the kind badge updated
  // and no parse error was logged — not just that *something* is on the canvas.
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^block diagram:/);
  await expect(page.locator("#kind")).toHaveText("block");
  expect(errors).toEqual([]);
});
