import { expect, test, type Page } from "@playwright/test";
import { expectSourceMatches, setSource } from "./support/source.js";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const activeNav = (page: Page) =>
  page.evaluate(() => {
    const ad = document.querySelector("#diagram-nav")?.getAttribute("aria-activedescendant");
    return ad === null || ad === undefined ? "" : (document.getElementById(ad)?.textContent ?? "");
  });

// Drive the keyboard navigator's two-step connect (`c` on the source, navigate, `c` on the target) —
// it works for non-adjacent nodes, unlike Shift+Arrow multi-select.
const navConnect = async (page: Page, source: string, target: string) => {
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 24 && !(await activeNav(page)).includes(source); i++) {
    await page.keyboard.press("ArrowDown");
  }
  expect(await activeNav(page)).toContain(source);
  await page.keyboard.press("c"); // arm the source
  for (let i = 0; i < 24 && !(await activeNav(page)).includes(target); i++) {
    await page.keyboard.press("ArrowDown");
  }
  expect(await activeNav(page)).toContain(target);
  await page.keyboard.press("c"); // connect to the target
};

test("gitGraph connect merges one branch lane into another", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "gitGraph\n  commit\n  branch develop\n  commit\n  checkout main\n  commit\n");
  await navConnect(page, "main", "develop");
  // The only edge a git graph has — a merge — is appended as checkout + merge, and re-parses.
  await expectSourceMatches(page, /checkout main\n\s*merge develop/);
});

test("timeline connect re-parents an event under a different period", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "timeline\n  2001 : Alpha : Beta\n  2002 : Gamma\n");
  await navConnect(page, "Beta", "2002");
  await expectSourceMatches(page, "timeline\n  2001 : Alpha\n  2002 : Gamma : Beta\n");
});

// Deleting a gitGraph branch lane deletes the branch and all commits on it.
test("deleting a gitGraph branch lane removes it and its commits", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  const src = "gitGraph\n  commit\n  branch develop\n  commit\n  checkout main\n  commit\n";
  await setSource(page, src);
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 20; i++) {
    const a = await page.evaluate(() => {
      const ad = document.querySelector("#diagram-nav")?.getAttribute("aria-activedescendant");
      return ad === null || ad === undefined ? "" : (document.getElementById(ad)?.textContent ?? "");
    });
    if (a.includes("develop")) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Delete");
  await expect(page.locator("#status")).toHaveText(/deleted 1 item/);
  await expectSourceMatches(page, "gitGraph\n  commit\n  checkout main\n  commit\n");
});

test("timeline delete removes an event from the source (real, not a no-op)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await setSource(page, "timeline\n  2001 : Alpha : Beta\n  2002 : Gamma\n");
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 20; i++) {
    if ((await activeNav(page)).includes("Beta")) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Delete");
  await expectSourceMatches(page, "timeline\n  2001 : Alpha\n  2002 : Gamma\n");
});

test("a DOT import is editable on the canvas (edits enabled)", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(100);
  await setSource(page, "digraph G {\n  a -> b;\n  b -> c;\n}\n");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  // Add is enabled; the Place tool is enabled; the render is valid.
  await expect(page.locator("#add-node")).toBeEnabled();
  await expect(page.locator("#tool-place")).toBeEnabled();
});

test("connect button is disabled for 3+ selected items in capped families", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);

  // 1. In a flowchart (uncapped), 3 selected items allows Connect
  await setSource(page, "flowchart TD\n  A\n  B\n  C\n");

  await expect(page.locator("#diagram-nav")).toContainText("A");
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("Home"); // selects A
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowDown"); // adds B to selection
  await page.keyboard.press("ArrowDown"); // adds C to selection
  await page.keyboard.up("Shift");

  await expect(page.locator("#connect")).toBeEnabled();

  // 2. In a gitGraph (capped), 3 selected items disables Connect
  await setSource(page, "gitGraph\n  commit\n  branch develop\n  commit\n  branch feature\n  commit\n");
  await expect(page.locator("#diagram-nav")).toContainText("main");
  await page.locator("#diagram-nav").focus();
  await page.keyboard.press("Home"); // selects main
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowDown"); // adds develop
  await page.keyboard.press("ArrowDown"); // adds feature
  await page.keyboard.up("Shift");

  await expect(page.locator("#connect")).toBeDisabled();
  await expect(page.locator("#connect")).toHaveAttribute("title", /exactly two nodes/);
});
