import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const accent = (page: Page, id: string) =>
  page.evaluate((n) => window.__nodeAccent?.(n) ?? null, id);

test("the Colour control cycles a node's accent (visual-only) and persists across reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TB\n  A[A] --> B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(await accent(page, "A")).toBe("none");

  const box = await page.locator("#stage").boundingBox();
  if (box === null) return;
  await page.mouse.click(box.x + box.width / 2, box.y + 40); // select node A
  await expect(page.locator("#ctx-colour")).toBeVisible();
  await page.locator("#ctx-colour").click();
  await expect.poll(() => accent(page, "A")).toBe("active"); // none → active

  await page.locator("#ctx-colour").click();
  await expect.poll(() => accent(page, "A")).toBe("muted"); // active → muted

  // Survives a reload (per-browser visual preference).
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect.poll(() => accent(page, "A")).toBe("muted");
});
