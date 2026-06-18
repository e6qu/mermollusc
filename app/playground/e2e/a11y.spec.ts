import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("the diagram canvas exposes a text alternative for screen readers", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("role", "img");

  // A successful render summarises kind, counts, and node labels.
  await setSource(page, "flowchart TD\n  A[Start] --> B[Finish]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute(
    "aria-label",
    /flowchart diagram: 2 nodes, 1 edge\. Nodes: Start, Finish/,
  );

  // A parse error is announced rather than leaving a stale description.
  await setSource(page, "flowchart TD\n  A --> @@@\n");
  await expect(stage).toHaveAttribute("aria-label", /^Diagram error:/);
});

test("every visible interactive control has an accessible name", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const unnamed = await page.evaluate(() => {
    const name = (el: Element): string =>
      (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
    return Array.from(document.querySelectorAll("button, select, a[href]"))
      .filter((el) => (el as HTMLElement).offsetParent !== null && name(el) === "")
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || "(no id)"}`);
  });
  expect(unnamed).toEqual([]);
});
