import { expect, type Page } from "@playwright/test";

// Node-anchored canvas coordinates via the app's `__nodeRect` e2e hook (viewport-absolute CSS pixels).
// Specs must target nodes through these instead of hardcoded pixel offsets — magic offsets break every
// time node metrics change (fonts, padding, layout defaults), which is exactly how the 2026-07 Mermaid
// font-parity change invalidated 27 specs at once.

declare global {
  interface Window {
    __nodeRect?: (nodeId: string) => { x: number; y: number; w: number; h: number } | null;
  }
}

export const nodeRect = async (
  page: Page,
  id: string,
): Promise<{ x: number; y: number; w: number; h: number }> => {
  await expect
    .poll(() => page.evaluate((nid) => window.__nodeRect?.(nid) ?? null, id))
    .not.toBeNull();
  const r = await page.evaluate((nid) => window.__nodeRect?.(nid) ?? null, id);
  if (r === null) throw new Error(`node not found: ${id}`);
  return r;
};

export const nodeCenter = async (page: Page, id: string): Promise<{ x: number; y: number }> => {
  const r = await nodeRect(page, id);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

// Click a node's centre (plain select).
export const clickNode = async (page: Page, id: string): Promise<void> => {
  const c = await nodeCenter(page, id);
  await page.mouse.click(c.x, c.y);
};

// Drag a node by a delta from its centre.
export const dragNodeBy = async (
  page: Page,
  id: string,
  dx: number,
  dy: number,
): Promise<void> => {
  const c = await nodeCenter(page, id);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 8 });
  await page.mouse.up();
};
