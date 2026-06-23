import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// Two-way edits validate the new label against the delimiter that would terminate its token early, and
// reject the commit *loudly* (status error) instead of writing un-parseable source. Each reject is
// paired with a positive round-trip so the guard is proven to discriminate, not just always-fail.
// The keyboard navigator (focus #diagram-nav, Enter) opens the inline editor on a precise item, so
// these don't depend on pixel hit-testing an edge.

const ready = async (page: Page) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

const relabelActive = async (page: Page, text: string) => {
  await page.locator("#diagram-nav").press("Enter");
  const inline = page.locator("#inline-edit");
  await expect(inline).toBeVisible();
  await inline.fill(text);
  await inline.press("Enter");
};

test("a flowchart node label containing the bracket closer is rejected, a clean one round-trips", async ({
  page,
}) => {
  await ready(page);
  await setSource(page, "flowchart TD\n  A[Start]\n");
  await page.locator("#diagram-nav").focus(); // selects the first item (node A)

  await relabelActive(page, "End]");
  await expect.poll(() => sourceValue(page)).toContain("A[Start]"); // unchanged
  await expect(page.locator("#status")).toHaveAttribute("data-level", "error");
  await expect(page.locator("#status")).toContainText("can't rename");

  await relabelActive(page, "My Start");
  await expectSourceMatches(page, /A\[My Start\]/);
});

test("a flowchart edge pipe-label containing a pipe is rejected, a clean one round-trips", async ({
  page,
}) => {
  await ready(page);
  await setSource(page, "flowchart TD\n  A[Top] -->|yes| B[Bottom]\n");
  await page.locator("#diagram-nav").focus();
  // nav order is nodes then edges: A(0), B(1), edge(2) — arrow down to the edge.
  await page.locator("#diagram-nav").press("ArrowDown");
  await page.locator("#diagram-nav").press("ArrowDown");

  await relabelActive(page, "n|o");
  await expect.poll(() => sourceValue(page)).toContain("-->|yes|"); // unchanged
  await expect(page.locator("#status")).toHaveAttribute("data-level", "error");

  await relabelActive(page, "maybe");
  await expectSourceMatches(page, /-->\|maybe\|/);
});

test("a quoted network label containing a quote is rejected, a clean one round-trips", async ({
  page,
}) => {
  await ready(page);
  await setSource(page, 'network\n  server web "Web"\n');
  await page.locator("#diagram-nav").focus();

  await relabelActive(page, 'a"b');
  await expect.poll(() => sourceValue(page)).toContain('"Web"'); // unchanged
  await expect(page.locator("#status")).toHaveAttribute("data-level", "error");

  await relabelActive(page, "Web Server");
  await expectSourceMatches(page, /"Web Server"/);
});
