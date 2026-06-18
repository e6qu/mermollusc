import { expect, test, type Page } from "@playwright/test";
import { setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

test("renders a class diagram (members + UML relationships) from the textarea", async ({ page }) => {
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
    "classDiagram\n  class Animal {\n    +String name\n    +move() void\n  }\n  Animal <|-- Duck\n  Animal *-- Leg\n",
  );
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  await expect(page.locator("#kind")).toHaveText("class");
  await expect(page.locator("#stage")).toHaveAttribute("aria-label", /class diagram.*Animal/);
  expect(parseErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test("the class example loads and parses cleanly", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await page.locator("#example").selectOption("class");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect(page.locator("#kind")).toHaveText("class");
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0);

  expect(errors).toEqual([]);
});
