import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource, sourceValue } from "./support/source.js";

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

test("renders a `block:id … end` composite and deletes it whole", async ({ page }) => {
  const errors = watchPipelineErrors(page);
  page.on("dialog", (d) => void d.accept()); // confirm the container-delete cascade
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    'block-beta\n  a["A"]\n  block:svc\n    api["API"]\n    db["DB"]\n  end\n  c["C"]\n  a --> api\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // The composite + its two leaves render (5 scene nodes: A, svc, API, DB, C).
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /API.*DB|DB.*API/);
  expect(errors).toEqual([]);

  // Select the composite in the navigator and Delete — the whole `block:svc … end` goes, leaves stay.
  await page.locator("#diagram-nav").focus();
  let label = "";
  for (let i = 0; i < 12 && !label.includes("svc"); i++) {
    label = await page.evaluate(() => {
      const ad = document.querySelector("#diagram-nav")?.getAttribute("aria-activedescendant");
      return ad === null || ad === undefined ? "" : (document.getElementById(ad)?.textContent ?? "");
    });
    if (!label.includes("svc")) await page.keyboard.press("ArrowDown");
  }
  expect(label).toContain("svc");
  await page.keyboard.press("Delete");

  await expect.poll(() => sourceValue(page)).not.toContain("block:svc");
  await expect.poll(() => sourceValue(page)).not.toContain("API");
  await expect.poll(() => sourceValue(page)).toContain('a["A"]'); // a survives
  await expect.poll(() => sourceValue(page)).toContain('c["C"]'); // c survives
});
