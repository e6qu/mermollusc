import { expect, test, type Page } from "@playwright/test";
import { collabUrl } from "./collab-url.js";
import { dragNodeBy } from "./support/nodes.js";

// The end-to-end proof of the dev WebSocket transport: two independent browser contexts ("tabs") open
// the same `?collab&room=…`, and an overlay drag in one appears in the other via the relay. Both tabs
// load the default sample (same node ids), so the override the drag produces applies in both.

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const remoteOverrideCount = (page: Page) =>
  page.evaluate(() => window.__collabOverrideCount?.() ?? -1);

test("two ?collab tabs converge: a drag in one tab appears in the other", async ({ browser }) => {
  const room = "convergence";
  const errors: string[] = [];

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  a.on("pageerror", (e) => errors.push(`A: ${e.message}`));
  b.on("pageerror", (e) => errors.push(`B: ${e.message}`));

  await a.goto(collabUrl(room));
  await b.goto(collabUrl(room));
  await expect.poll(() => canvasWidth(a)).toBeGreaterThan(0);
  await expect.poll(() => canvasWidth(b)).toBeGreaterThan(0);

  // both tabs start with no overrides
  await expect.poll(() => remoteOverrideCount(a)).toBe(0);
  await expect.poll(() => remoteOverrideCount(b)).toBe(0);

  // drag the Start node in tab A
  await dragNodeBy(a, "A", 232, 194);

  // tab B receives the override over the relay
  await expect.poll(() => remoteOverrideCount(b), { timeout: 6000 }).toBe(1);
  await b.screenshot({ path: "shots/collab-sync-b.png" });

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
