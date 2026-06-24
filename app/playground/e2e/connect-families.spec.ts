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
