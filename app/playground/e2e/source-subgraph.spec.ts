import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const sourceText = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");
const shapes = (page: Page) =>
  page.evaluate(() => (window.__shownGeometry?.()?.nodes ?? []).map((n) => n.shape));

const clickNode = async (page: Page, id: string, additive = false): Promise<void> => {
  const r = await page.evaluate((n) => window.__nodeRect?.(n) ?? null, id);
  if (r === null) throw new Error(`no node ${id}`);
  if (additive) await page.keyboard.down("Shift");
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  if (additive) await page.keyboard.up("Shift");
};

// Source-canonical grouping: grouping flowchart nodes writes a Mermaid `subgraph … end` block into the
// source (not the overlay), and ungrouping removes the block. Mermaid can express grouping, so it lives
// in the source.
test("grouping flowchart nodes writes a subgraph block; ungrouping removes it", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[A] --> B[B]\n  B --> C[C]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await clickNode(page, "A");
  await clickNode(page, "B", true);
  await page.locator("#group").click();

  // a real Mermaid subgraph block, listing the members, before the edges that use them
  await expect.poll(() => sourceText(page)).toContain("subgraph group1[Group]");
  await expect.poll(() => shapes(page)).toContain("container"); // renders as a nested container

  // ungroup by selecting a member node inside the group, then Ungroup
  await clickNode(page, "A");
  await expect(page.locator("#ungroup")).toBeEnabled();
  await page.locator("#ungroup").click();
  await expect.poll(() => sourceText(page)).not.toContain("subgraph");
  // the members survive (they're still in their edges)
  await expect.poll(() => shapes(page)).not.toContain("container");
});
