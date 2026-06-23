import { expect, test, type Page } from "@playwright/test";
import { setSource, sourceValue } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const ready = async (page: Page) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

// Family-capability gating: Connect and the icon picker are only offered on families whose grammar can
// accept what they insert — offering them elsewhere would write un-parseable source.
test("Connect and Icons are gated to families whose grammar accepts them", async ({ page }) => {
  await ready(page);
  const connect = page.locator("#connect");
  const icons = page.locator("#icons-toggle");

  // Default flowchart: no icon overrides (network/cloud/block only).
  await expect(icons).toBeDisabled();
  await expect(icons).toHaveAttribute("title", /icons aren't available for flowchart/);

  // Pie: neither Connect nor Icons applies.
  await setSource(page, 'pie\n  "A" : 1\n  "B" : 2\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(connect).toBeDisabled();
  await expect(connect).toHaveAttribute("title", /connect isn't available for pie/);
  await expect(icons).toBeDisabled();

  // Network: the icon picker is offered.
  await setSource(page, 'network\n  server web "Web"\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(icons).toBeEnabled();
});

// A keystroke no longer wipes manual layout: a nudged node keeps its position when unrelated text is
// edited, and Share carries that overlay so a recipient sees the same arrangement.
test("manual layout survives a text edit and rides along in the share link", async ({ page }) => {
  await ready(page);
  await setSource(page, "flowchart TD\n  A[Alpha]\n  B[Beta]\n  A --> B\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // Select a node on the canvas and nudge it — that records a manual position override.
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.click(box.x + box.width / 2, box.y + 40);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  // Edit the source (append a node) — the override for the nudged node must NOT be discarded.
  await setSource(page, "flowchart TD\n  A[Alpha]\n  B[Beta]\n  C[Gamma]\n  A --> B\n");
  await expect.poll(() => sourceValue(page)).toContain("Gamma");

  // Share encodes the surviving overlay in the hash.
  await page.locator("#share-link").click();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain("overlay=");

  // Re-opening the shared link restores it and renders without error.
  const hash = await page.evaluate(() => location.hash);
  await page.goto(`/${hash}`);
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#stage-wrap")).toHaveAttribute("data-stale", "false");
});

// Loading an example over genuinely authored work asks first; switching between pristine samples does not.
test("loading an example guards authored work but not pristine samples", async ({ page }) => {
  await ready(page);
  await setSource(page, "flowchart TD\n  Mine[my work]\n");
  await expect.poll(() => sourceValue(page)).toContain("my work");

  // Cancel the confirm → the authored source is kept.
  page.once("dialog", (d) => void d.dismiss());
  await page.locator("#example").selectOption("sequence");
  await expect.poll(() => sourceValue(page)).toContain("my work");

  // Accept the confirm → the example loads.
  page.once("dialog", (d) => void d.accept());
  await page.locator("#example").selectOption("sequence");
  await expect.poll(() => sourceValue(page)).toContain("sequenceDiagram");

  // Switching from one pristine example to another does not prompt.
  let prompted = false;
  page.on("dialog", (d) => {
    prompted = true;
    void d.accept();
  });
  await page.locator("#example").selectOption("mindmap");
  await expect.poll(() => sourceValue(page)).toContain("mindmap");
  expect(prompted).toBe(false);
});

// Shortcut hints carry a platform modifier chip that is populated (⌘ on Apple, Ctrl elsewhere).
test("shortcut hints show a populated platform modifier", async ({ page }) => {
  await ready(page);
  const mod = page.locator(".hints [data-mod='mod']").first();
  await expect(mod).toHaveText(/⌘|Ctrl/);

  await page.locator("#help-toggle").click();
  await expect(page.locator("#syntax-list details")).not.toHaveCount(0);
});
