import { expect, test, type Page } from "@playwright/test";

// Proves the live source-text binding: the diagram TEXT (not just the overlay) syncs across two
// `?collab` tabs via the Y.Text ↔ CodeMirror binding. Tab A seeds the room; tab B adopts it; then an
// edit in A appears in B's editor and re-renders its canvas.

const editorValue = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");
const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

declare global {
  interface Window {
    __editor?: { value(): string; setValue(text: string): void };
  }
}

test("two ?collab tabs share the source text live", async ({ browser }) => {
  const room = "source-sync";
  const errors: string[] = [];

  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  a.on("pageerror", (e) => errors.push(`A: ${e.message}`));
  await a.goto(`/?collab&room=${room}`);
  // tab A seeds the empty room with the sample after its sync settles
  await expect.poll(() => editorValue(a), { timeout: 6000 }).toContain("flowchart");

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => errors.push(`B: ${e.message}`));
  await b.goto(`/?collab&room=${room}`);
  // tab B joins and adopts A's text (not a duplicated seed)
  await expect.poll(() => editorValue(b), { timeout: 6000 }).toBe(await editorValue(a));

  // edit the source in A → B's editor and canvas follow
  const next = "flowchart LR\n  X[One] --> Y[Two]\n";
  await a.evaluate((t) => window.__editor?.setValue(t), next);
  await expect.poll(() => editorValue(b), { timeout: 6000 }).toBe(next);
  await expect.poll(() => canvasWidth(b)).toBeGreaterThan(0);
  await b.screenshot({ path: "shots/collab-source-b.png" });

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
