import { expect, test, type Page } from "@playwright/test";

// Presence: with two `?collab` tabs in a room, moving the cursor in tab A renders A's remote caret in
// tab B's editor (a `.cm-ySelectionCaret`, coloured by A's awareness `user` state). Built on the shared
// source binding — both tabs share the text, so A's cursor offset maps into B's editor.

const editorValue = (page: Page) => page.evaluate(() => window.__editor?.value() ?? "");

declare global {
  interface Window {
    __editor?: { value(): string; setValue(text: string): void };
  }
}

test("a remote cursor from one ?collab tab shows in the other", async ({ browser }) => {
  const room = "presence";
  const errors: string[] = [];

  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  a.on("pageerror", (e) => errors.push(`A: ${e.message}`));
  await a.goto(`/?collab&room=${room}`);
  await expect.poll(() => editorValue(a), { timeout: 6000 }).toContain("flowchart");

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => errors.push(`B: ${e.message}`));
  await b.goto(`/?collab&room=${room}`);
  await expect.poll(() => editorValue(b), { timeout: 6000 }).toBe(await editorValue(a));

  // place + move A's cursor in the shared text → A's selection enters awareness → broadcast to B
  await a.locator(".cm-content").click();
  await a.keyboard.press("ArrowDown");
  await a.keyboard.press("ArrowRight");

  // B renders A's remote caret
  await expect(b.locator(".cm-ySelectionCaret")).toHaveCount(1, { timeout: 6000 });
  await b.screenshot({ path: "shots/collab-presence-b.png" });

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
