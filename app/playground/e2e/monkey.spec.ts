import { expect, test, type Page } from "@playwright/test";

// A deterministic "monkey": a fixed-seed pseudo-random sequence of real clicks, drags, key presses and
// toggles all over the UI. The point isn't a specific assertion — it's broad coverage that NO sequence
// of plausible interactions throws an uncaught error or wedges the render pipeline. Parse/layout errors
// from deliberately-mangled source are fine (an honest error state); an uncaught exception is not.

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

// A tiny seeded LCG so the run is reproducible (a failure replays identically).
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

test("a random storm of clicks/keys/toggles never throws or wedges the pipeline", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(`${e.message}`));
  // Accept any confirmation dialog (container delete, etc.) so the storm keeps moving.
  page.on("dialog", (d) => void d.accept());

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no stage box");
  const rng = makeRng(0xc0ffee);
  const at = () => ({
    x: box.x + 12 + rng() * (box.width - 24),
    y: box.y + 12 + rng() * (box.height - 24),
  });
  const tools = ["#tool-select", "#tool-hand", "#tool-connect", "#tool-place"];
  const toggles = ["#theme", "#sketch"]; // non-modal instant toggles (the icon picker modal would trap)
  const keys = ["s", "d", "Escape", "Delete", "Control+z", "Control+d"];

  const examples = await page.locator("#example option").count();

  for (let i = 0; i < 60; i++) {
    // Clear any transient overlay the previous action opened (inline editor, menu, modal) so the next
    // chrome click isn't blocked by a backdrop.
    await page.keyboard.press("Escape");
    const roll = rng();
    if (roll < 0.18) {
      // A tool can be disabled for the current family (e.g. Place on a timeline) — fall back to Select.
      const tool = page.locator(tools[Math.floor(rng() * tools.length)] ?? "#tool-select");
      await ((await tool.isEnabled()) ? tool : page.locator("#tool-select")).click();
    } else if (roll < 0.36) {
      const p = at();
      await page.mouse.click(p.x, p.y);
    } else if (roll < 0.5) {
      const p = at();
      await page.mouse.dblclick(p.x, p.y);
      await page.keyboard.press("Escape"); // dismiss any inline editor that opened
    } else if (roll < 0.66) {
      const a = at();
      const b = at();
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await page.mouse.up();
    } else if (roll < 0.8) {
      await page.keyboard.press(keys[Math.floor(rng() * keys.length)] ?? "Escape");
    } else if (roll < 0.9 && examples > 1) {
      await page.locator("#example").selectOption({ index: Math.floor(rng() * examples) });
      await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
    } else {
      await page.locator(toggles[Math.floor(rng() * toggles.length)] ?? "#theme").click();
    }
    // No interaction may have thrown an uncaught error at any point.
    expect(pageErrors, `after action ${i} (roll ${roll.toFixed(3)})`).toEqual([]);
  }

  // The app is still alive and rendering after the storm.
  await page.keyboard.press("Escape");
  await page.locator("#tool-select").click();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
