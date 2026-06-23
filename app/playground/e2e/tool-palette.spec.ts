import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);
const tool = (page: Page) => page.evaluate(() => window.__activeTool?.() ?? "");

const ready = async (page: Page) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
};

test("clicking a palette tool arms it and moves the radiogroup's checked state", async ({ page }) => {
  await ready(page);
  await expect(page.locator("#tool-select")).toHaveAttribute("aria-checked", "true");

  await page.locator("#tool-hand").click();
  expect(await tool(page)).toBe("hand");
  await expect(page.locator("#tool-hand")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#tool-select")).toHaveAttribute("aria-checked", "false");

  await page.locator("#tool-connect").click();
  expect(await tool(page)).toBe("connect");
  await expect(page.locator("#tool-connect")).toHaveAttribute("aria-checked", "true");
});

test("arrow keys rove the palette radiogroup, skipping disabled tools", async ({ page }) => {
  await ready(page);
  // network supports connect + icons but not place — Place must be skipped by roving.
  await setSource(page, 'network\n  server web "Web"\n  server db "DB"\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#tool-place")).toBeDisabled();

  await page.locator("#tool-select").focus();
  await page.keyboard.press("ArrowDown"); // → hand
  expect(await tool(page)).toBe("hand");
  await page.keyboard.press("ArrowDown"); // → connect
  expect(await tool(page)).toBe("connect");
  await page.keyboard.press("ArrowDown"); // place disabled → wraps to select
  expect(await tool(page)).toBe("select");
});

test("the palette disables tools a family can't support, and reverts an armed-but-now-invalid tool", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#tool-connect").click(); // flowchart supports connect
  expect(await tool(page)).toBe("connect");

  // Switch to pie (no connect, no place) — both disable and the armed tool falls back to select.
  await setSource(page, 'pie\n  "A" : 1\n  "B" : 2\n');
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#tool-connect")).toBeDisabled();
  await expect(page.locator("#tool-place")).toBeDisabled();
  expect(await tool(page)).toBe("select");
  await expect(page.locator("#tool-select")).toHaveAttribute("aria-checked", "true");
});
