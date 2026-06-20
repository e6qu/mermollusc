import { expect, test, type Page } from "@playwright/test";

// The role-aware client: when the relay grants the `viewer` role, the editor and the canvas tools go
// read-only and a "view only" badge shows; an `editor` grant restores editing. Driven through the
// `__collabSetRole` hook (the role normally arrives as a server control frame).

const editorValue = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");

declare global {
  interface Window {
    __editor?: { value(): string; setValue(text: string): void };
    __collabSetRole?: (role: string) => void;
  }
}

test("a viewer role makes the editor + tools read-only; editor restores it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/?collab&room=role-test");
  await expect.poll(() => editorValue(page), { timeout: 6000 }).toContain("flowchart");
  // default (editor) — the buffer is editable and no badge yet
  await expect(page.locator(".cm-content")).toHaveAttribute("contenteditable", "true");

  // become a viewer
  await page.evaluate(() => window.__collabSetRole?.("viewer"));
  await expect(page.locator(".cm-content")).toHaveAttribute("contenteditable", "false");
  await expect(page.locator("#role-badge")).toBeVisible();
  await expect(page.locator("#role-badge")).toHaveText("view only");
  expect(await page.evaluate(() => document.body.dataset["role"])).toBe("viewer");
  await page.screenshot({ path: "shots/collab-role-viewer.png" });

  // back to editor — editing restored, badge reflects the role
  await page.evaluate(() => window.__collabSetRole?.("editor"));
  await expect(page.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
  await expect(page.locator("#role-badge")).toHaveText("editor");

  expect(errors).toEqual([]);
});
