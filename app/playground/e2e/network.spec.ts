import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a network diagram (kinds + undirected links) from the textarea", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page,
    'network\n  cloud net "Internet"\n  router r1 "Edge"\n  server web "Web"\n  net -- r1\n  r1 -- web : "eth0"\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
