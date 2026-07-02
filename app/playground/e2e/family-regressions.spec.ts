import { expect, test, type Page } from "@playwright/test";

// Regression guards for the 2026-07 family bug sweep. The root cause of most of it: an app-side
// post-pass snapped EVERY family's edges onto node-box mount points, which collapsed sequence messages
// onto the header row, elbowed mindmap/gitGraph diagonals, and detached timeline connectors. These
// specs read shown-scene geometry through the __edgeWaypoints/__nodeRect hooks, so any future scene
// corruption of this class fails loudly.

declare global {
  interface Window {
    __edgeWaypoints?: (edgeId: string) => { x: number; y: number }[] | null;
  }
}

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const waypoints = (page: Page, id: string) =>
  page.evaluate((eid) => window.__edgeWaypoints?.(eid) ?? null, id);

test("sequence messages stagger down the lifelines (never collapse onto the header row)", async ({
  page,
}) => {
  await page.goto("/?example=sequence");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const first = await waypoints(page, "m0");
  const later = await waypoints(page, "m5");
  expect(first).not.toBeNull();
  expect(later).not.toBeNull();
  if (first === null || later === null) return;
  // Messages are horizontal rows BELOW the actor header (header height 40 + gap), stepping downward.
  expect(first[0]?.y ?? 0).toBeGreaterThan(60);
  expect(later[0]?.y ?? 0).toBeGreaterThan((first[0]?.y ?? 0) + 100);
});

test("gantt draws a dependency connector from predecessor end to successor start", async ({
  page,
}) => {
  await page.goto("/?example=gantt");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // The example declares `Target workflow :workflow, after interviews, 1w`.
  const dep = await waypoints(page, "dep:interviews->workflow");
  expect(dep).not.toBeNull();
  if (dep === null) return;
  expect(dep.length).toBeGreaterThanOrEqual(3); // an elbow, not a bare line
});

test("the Examples select keeps showing the loaded example and resets once the source diverges", async ({
  page,
}) => {
  await page.goto("/?example=state");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#example")).toHaveValue("state");
  // Divergence: any edit drops the select back to the placeholder.
  await page.evaluate(() => window.__editor?.setValue("flowchart TD\n  a[Hi] --> b[There]\n"));
  await expect(page.locator("#example")).toHaveValue("");
});

test("a C4 boundary is resizable from the keyboard", async ({ page }) => {
  await page.goto("/?example=c4");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__nodeRect?.("shop") ?? null);
  expect(before).not.toBeNull();
  if (before === null) return;
  await page.mouse.click(before.x + before.w / 2, before.y + 12); // the boundary title band
  await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.press("Alt+ArrowRight");
  await expect
    .poll(async () => (await page.evaluate(() => window.__nodeRect?.("shop") ?? null))?.w ?? 0)
    .toBeGreaterThan(before.w);
});

test("an edge running inside a block composite is clickable (selects the edge, not the container)", async ({
  page,
}) => {
  await page.goto("/?example=block");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Edge ids are positional (`e<n>`): e4 is `web1 --> api1`, which runs inside the `app` composite.
  const wps = await waypoints(page, "e4");
  expect(wps).not.toBeNull();
  if (wps === null) return;
  const stage = await page.locator("#stage").boundingBox();
  if (stage === null) throw new Error("no stage box");
  // Convert scene coords to screen: probe the midpoint of the LONGEST segment (clear of endpoints).
  let best = { x: 0, y: 0, len: -1 };
  for (let i = 0; i + 1 < wps.length; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    if (a === undefined || b === undefined) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best.len) best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, len };
  }
  const screen = await page.evaluate((p) => {
    const hook = (
      window as unknown as {
        __sceneToScreen?: (x: number, y: number) => { x: number; y: number } | null;
      }
    ).__sceneToScreen;
    return hook ? hook(p.x, p.y) : null;
  }, best);
  expect(screen).not.toBeNull();
  if (screen === null) return;
  await page.mouse.click(screen.x, screen.y);
  // The Route control is edge-selection-only — it visible proves the click selected the EDGE.
  await expect(page.locator("#ctx-curve")).toBeVisible();
});
