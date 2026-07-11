import { expect, test, type Page } from "@playwright/test";
import { watchPipelineErrors } from "./support/render.js";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a sequence diagram from the textarea", async ({ page }) => {
  const errors = watchPipelineErrors(page);

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(page, "sequenceDiagram\n  A->>B: Hello\n  B-->>A: Hi there\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /^sequence diagram:/);
  await expect(page.locator("#kind")).toHaveText("sequence");
  expect(errors).toEqual([]);
});

// Regression: switching FROM a mount-snapping family (flowchart) TO sequence used to render the
// messages collapsed onto the actor-header row — `shownScene` derived the family from a stale `ast`
// (still flowchart) on the first paint, snapped the sequence messages to the actor mounts, and cached
// it (the cache key omitted the family). The messages must march DOWN the lifelines instead.
test("sequence messages stay on their lifeline rows after switching from a flowchart", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  // Start on a flowchart (a mount-snap family), then switch to a multi-message sequence.
  await setSource(page, "flowchart TD\n  A --> B\n");
  await expect(page.locator("#kind")).toHaveText("flowchart");
  await setSource(
    page,
    "sequenceDiagram\n  participant U as User\n  participant W as Web\n  participant A as API\n  U->>W: one\n  W->>A: two\n  A->>W: three\n  W-->>U: four\n",
  );
  await expect(page.locator("#kind")).toHaveText("sequence");

  const messageYs = await page.evaluate(() =>
    (window.__shownGeometry?.()?.edges ?? [])
      .filter((e) => e.from !== e.to)
      .map((e) => Math.round(e.waypoints[0]?.y ?? 0)),
  );
  expect(messageYs.length).toBe(4);
  // The actor headers occupy roughly y 0..40; a message on the header row (the bug) sits at ~20. Every
  // message must be well below that, and the rows must be DISTINCT (spread), not stacked on one y.
  for (const y of messageYs) expect(y).toBeGreaterThan(60);
  expect(new Set(messageYs).size).toBe(messageYs.length);
});
