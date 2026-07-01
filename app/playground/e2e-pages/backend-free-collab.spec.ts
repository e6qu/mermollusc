import { expect, test, type Page } from "@playwright/test";

const canvasWidth = (page: Page) =>
  page.locator("#stage").evaluate((c) => (c as HTMLCanvasElement).width);

const overrideCount = (page: Page) =>
  page.evaluate(() => window.__collabOverrideCount?.() ?? -1);

const clearRoomStore = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("mermollusc-collab", 1);
        open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
        open.onupgradeneeded = () => reject(new Error("IndexedDB room database was missing"));
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("rooms", "readwrite");
          const request = transaction.objectStore("rooms").clear();
          request.onerror = () => {
            db.close();
            reject(request.error ?? new Error("IndexedDB clear failed"));
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error ?? new Error("IndexedDB clear aborted"));
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error ?? new Error("IndexedDB clear transaction failed"));
          };
        };
      }),
  );

const hasIndexedDbRoom = (page: Page, room: string) =>
  page.evaluate(
    (roomName) =>
      new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open("mermollusc-collab", 1);
        open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
        open.onupgradeneeded = () => reject(new Error("IndexedDB room database was missing"));
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("rooms", "readonly");
          const request = transaction.objectStore("rooms").get(roomName);
          request.onerror = () => {
            db.close();
            reject(request.error ?? new Error("IndexedDB room load failed"));
          };
          request.onsuccess = () => {
            db.close();
            const result: unknown = request.result;
            resolve(result instanceof Uint8Array && result.byteLength > 0);
          };
        };
      }),
    room,
  );

test("built Pages demo keeps ?collab backend-free while persisting the local Yjs room", async ({
  page,
}) => {
  const errors: string[] = [];
  const websockets: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (socket) => websockets.push(socket.url()));

  await page.goto("./?collab&room=pages-e2e");
  await clearRoomStore(page);
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
  await expect(hasIndexedDbRoom(page, "pages-e2e")).resolves.toBe(true);

  await page.reload();
  await expect.poll(() => canvasWidth(page)).toBeGreaterThan(0);
  await expect.poll(() => overrideCount(page)).toBeGreaterThan(0);

  expect(websockets).toEqual([]);
  expect(errors).toEqual([]);
});
