import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a state diagram (transitions, [*], labels) from the textarea", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const parseErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("parse failed")) parseErrors.push(m.text());
  });

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);

  await setSource(
    page,
    "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running : start\n  Running --> [*]\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#kind")).toHaveText("state");
  expect(parseErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test("the State example loads and parses", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#example").selectOption("state");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("state");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0); // parsed cleanly

  expect(errors).toEqual([]);
});
