import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const nodeCenterPx = async (page: Page, id: string): Promise<number[]> => {
  const r = await page.evaluate((n) => window.__nodeRect?.(n) ?? null, id);
  if (r === null) throw new Error(`no node ${id}`);
  return page.evaluate(
    (rr) => {
      const c = document.querySelector("#stage");
      if (!(c instanceof HTMLCanvasElement)) return [0, 0, 0];
      const rect = c.getBoundingClientRect();
      const ctx = c.getContext("2d");
      if (ctx === null) return [0, 0, 0];
      const x = Math.round((rr.x + rr.w / 2 - rect.left) * (c.width / rect.width));
      const y = Math.round((rr.y + 6 - rect.top) * (c.height / rect.height));
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    },
    r,
  );
};

// Source-canonical node styling: a Mermaid `style`/`classDef` directive in the source colours the node
// (raw colour, not a lossy accent), and an unstyled node keeps its default.
test("a Mermaid style directive colours the node from the source", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[Alpha] --> B[Beta]\n  style A fill:#e11d48,stroke:#7f1d1d\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const a = await nodeCenterPx(page, "A");
  expect(a[0]).toBeGreaterThan(180); // #e11d48 is red-dominant
  expect(a[2] ?? 0).toBeGreaterThan(40);
  expect(a[2] ?? 255).toBeLessThan(120);
  // Beta is unstyled — the default light node fill (not red)
  const b = await nodeCenterPx(page, "B");
  expect(b[0] ?? 0).toBeLessThan(250);
});

test("classDef + class colours a node from the source too", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart TD\n  A[Alpha] --> B[Beta]\n  classDef hot fill:#16a34a\n  class B hot\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const b = await nodeCenterPx(page, "B");
  // #16a34a is green-dominant
  expect(b[1] ?? 0).toBeGreaterThan(120);
  expect(b[1] ?? 0).toBeGreaterThan(b[0] ?? 0);
});

test("classDef default colours every node (Mermaid compliance)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[Alpha] --> B[Beta]\n  classDef default fill:#16a34a\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  for (const id of ["A", "B"]) {
    const px = await nodeCenterPx(page, id);
    expect(px[1] ?? 0).toBeGreaterThan(px[0] ?? 0); // green-dominant default fill
  }
});

test("inline :::class shorthand colours the node from the source", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "flowchart LR\n  A[Alpha]:::hot --> B[Beta]\n  classDef hot fill:#16a34a\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const a = await nodeCenterPx(page, "A");
  expect(a[1] ?? 0).toBeGreaterThan(a[0] ?? 0); // green-dominant
});

test("state diagram classDef/::: colours nodes from the source too", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run:::hot\n  classDef hot fill:#16a34a\n  class Idle hot\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  for (const id of ["Idle", "Run"]) {
    const px = await nodeCenterPx(page, id);
    expect(px[1] ?? 0).toBeGreaterThan(px[0] ?? 0);
  }
});
