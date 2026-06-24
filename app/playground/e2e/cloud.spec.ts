import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a nested cloud diagram with service glyphs (no resolve failures)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page,
    'cloud\n  group "AWS" {\n    compute web "Web"\n    storage assets "Assets"\n    database db "Orders"\n    queue jobs "Jobs"\n    cdn edge "Edge"\n  }\n  web -- db\n',
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});

const nodeCount = (page: Page) =>
  page.locator("#stage").evaluate((c) => {
    const m = c.getAttribute("aria-label") ?? "";
    const x = m.match(/(\d+) nodes/);
    return x === null ? -1 : Number(x[1]);
  });

test("collapsing a cloud group (E) hides its members and persists across reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("mermollusc-cloud-collapsed")); // once, not on reload
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(
    page,
    'cloud\n  group "AWS" {\n    compute web "Web"\n    storage s3 "S3"\n  }\n  database db "DB"\n  web -- db\n',
  );
  await expect.poll(() => nodeCount(page)).toBe(4); // AWS + Web + S3 + DB

  // Select the AWS group in the navigator and press E to collapse it.
  await page.locator("#diagram-nav").focus();
  let label = "";
  for (let i = 0; i < 12 && !label.includes("AWS"); i++) {
    label = await page.evaluate(() => {
      const ad = document.querySelector("#diagram-nav")?.getAttribute("aria-activedescendant");
      return ad === null || ad === undefined ? "" : (document.getElementById(ad)?.textContent ?? "");
    });
    if (!label.includes("AWS")) await page.keyboard.press("ArrowDown");
  }
  expect(label).toContain("AWS");
  await page.keyboard.press("e");
  await expect.poll(() => nodeCount(page)).toBe(2); // AWS header + DB (Web/S3 hidden)

  await page.reload();
  await expect.poll(() => nodeCount(page)).toBe(2); // persisted
});
