import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("Add node appends a node to the source text and re-renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await page.locator("#add-node").click();
  await expectSourceMatches(page, /node 1/);

  expect(errors).toEqual([]);
});
