import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const overrideCount = (page: Page) =>
  page.evaluate(() => window.__collabOverrideCount?.() ?? -1);

test("built Pages demo keeps ?collab backend-free while persisting the local Yjs room", async ({
  page,
}) => {
  const errors: string[] = [];
  const websockets: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (socket) => websockets.push(socket.url()));

  await page.goto("./?collab&room=pages-e2e");
  await page.evaluate(() => localStorage.clear());
  await page.goto("./?collab&room=pages-e2e");
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => overrideCount(page)).toBe(0);

  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("no canvas box");
  await page.mouse.move(box.x + 88, box.y + 56);
  await page.mouse.down();
  await page.mouse.move(box.x + 280, box.y + 220, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => overrideCount(page)).toBeGreaterThan(0);
  await expect(
    page.evaluate(() => localStorage.getItem("mermollusc-collab-room:pages-e2e") !== null),
  ).resolves.toBe(true);

  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => overrideCount(page)).toBeGreaterThan(0);

  expect(websockets).toEqual([]);
  expect(errors).toEqual([]);
});
