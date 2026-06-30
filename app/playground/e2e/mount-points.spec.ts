import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

interface NodeBounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly shape: string;
}

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const mountsOf = (bounds: NodeBounds): readonly { readonly x: number; readonly y: number }[] => [
  { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
  { x: bounds.x, y: bounds.y + bounds.h / 2 },
  { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
  { x: bounds.x + bounds.w / 2, y: bounds.y },
];

const onMount = (
  p: { readonly x: number; readonly y: number },
  mounts: readonly { readonly x: number; readonly y: number }[],
): boolean => mounts.some((m) => Math.abs(m.x - p.x) < 0.5 && Math.abs(m.y - p.y) < 0.5);

test("Relax keeps diamond connectors on cardinal mount points", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(
    page,
    "flowchart TD\n  A[Application received] --> B{Authorized?}\n  B -->|Yes| C[Approve payment]\n  B -->|No| D[Manual review]\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await page.locator("#relax").click();
  await expect(page.locator("#status")).toContainText(/relaxed layout/i);

  const diamond = await page.evaluate(() => window.__nodeBounds?.("B") ?? null);
  expect(diamond).not.toBeNull();
  expect(diamond?.shape).toBe("diamond");
  if (diamond === null) throw new Error("expected diamond node B to be rendered");
  const mounts = mountsOf(diamond);

  const incident = await page.evaluate(() =>
    (window.__shownEdges?.() ?? []).filter((edge) => edge.from === "B" || edge.to === "B"),
  );
  expect(incident.length).toBeGreaterThanOrEqual(3);
  for (const edge of incident) {
    const endpoint =
      edge.from === "B" ? edge.waypoints[0] : edge.waypoints[edge.waypoints.length - 1];
    if (endpoint === undefined) throw new Error(`edge ${edge.id} has no endpoint`);
    expect(
      onMount(endpoint, mounts),
      `${edge.id} endpoint=${endpoint.x},${endpoint.y} mounts=${mounts
        .map((m) => `${m.x},${m.y}`)
        .join(";")}`,
    ).toBe(true);
  }
});
