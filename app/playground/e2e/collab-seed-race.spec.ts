import { expect, test, type Page } from "@playwright/test";
import { collabUrl } from "./collab-url.js";
import { sourceValue } from "./support/source.js";

// Regression guard for the seed race: two fresh clients joining the SAME empty room simultaneously used
// to both seed it (each saw the doc empty before the other's insert arrived), and Y.Text merged the two
// inserts into a duplicated document. The relay now grants seed rights to exactly one connection per
// empty room (the "seed" CONTROL message), so exactly one copy of the initial source must ever exist.

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("two tabs racing into a fresh room seed the document exactly once", async ({ browser }) => {
  const room = `seed-race-${Date.now()}`;
  const errors: string[] = [];

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  a.on("pageerror", (e) => errors.push(`A: ${e.message}`));
  b.on("pageerror", (e) => errors.push(`B: ${e.message}`));

  // Join as close to simultaneously as page loads allow — the worst case for the old race, since both
  // tabs' 300ms seed timers then expire while the other's insert is still in flight.
  await Promise.all([a.goto(collabUrl(room)), b.goto(collabUrl(room))]);
  await expect.poll(() => canvasWidth(a)).toBeGreaterThan(0);
  await expect.poll(() => canvasWidth(b)).toBeGreaterThan(0);

  // Both tabs converge on non-empty source (the granted tab seeded; the other synced it) …
  await expect.poll(() => sourceValue(a), { timeout: 6000 }).toMatch(/flowchart/);
  await expect.poll(() => sourceValue(b), { timeout: 6000 }).toMatch(/flowchart/);
  // … give any in-flight duplicate insert time to arrive, then assert EXACTLY ONE copy in both tabs:
  // the sample declares its header and its Start node once each.
  await a.waitForTimeout(800);
  for (const page of [a, b]) {
    const text = await sourceValue(page);
    expect(text.match(/flowchart TD/g)).toHaveLength(1);
    expect(text.match(/A\[Start\]/g)).toHaveLength(1);
  }

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
