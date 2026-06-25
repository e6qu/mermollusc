import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const isCurved = (page: Page, id: string) =>
  page.evaluate((e) => window.__shownEdges?.().find((x) => x.id === e)?.curved ?? null, id);

test("the Curve control toggles an edge between curved and straight (visual-only, persists)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[A] -->|go| B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(await isCurved(page, "e0")).toBe(false);

  // Select the edge via its label, then Curve.
  const pos = await page.evaluate(() => window.__edgeLabelPos?.("e0") ?? null);
  expect(pos).not.toBeNull();
  if (pos === null) return;
  await page.mouse.click(pos.x, pos.y);
  await expect(page.locator("#ctx-curve")).toBeVisible();
  await page.locator("#ctx-curve").click();
  await expect.poll(() => isCurved(page, "e0")).toBe(true);
  // The button now offers the inverse.
  await expect(page.locator("#ctx-curve")).toHaveText("Straighten");

  // It survives a reload (a per-browser visual preference), then can be straightened again.
  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await expect.poll(() => isCurved(page, "e0")).toBe(true);

  const pos2 = await page.evaluate(() => window.__edgeLabelPos?.("e0") ?? null);
  if (pos2 === null) return;
  await page.mouse.click(pos2.x, pos2.y);
  await page.locator("#ctx-curve").click();
  await expect.poll(() => isCurved(page, "e0")).toBe(false);
});

test("a curved edge travels in the share link and is undoable (it's real overlay state)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[A] -->|go| B[B]\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  const pos = await page.evaluate(() => window.__edgeLabelPos?.("e0") ?? null);
  if (pos === null) return;
  await page.mouse.click(pos.x, pos.y);
  await page.locator("#ctx-curve").click();
  await expect.poll(() => isCurved(page, "e0")).toBe(true);

  // Undo (overlay history) straightens it again.
  await page.locator("#stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => isCurved(page, "e0")).toBe(false);

  // Re-curve, then the share link carries the styling: a fresh load of that URL renders it curved.
  await page.mouse.click(pos.x, pos.y);
  await page.locator("#ctx-curve").click();
  await expect.poll(() => isCurved(page, "e0")).toBe(true);
  const url = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#share-link")?.click();
    return location.href; // Share sets the URL via history.replaceState regardless of clipboard
  });
  expect(url).toContain("overlay=");
  await page.goto(url);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => isCurved(page, "e0")).toBe(true);
});
