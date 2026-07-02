import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  createCollabSession,
  createIndexedDbRoomStore,
  createMemoryRoomStore,
  createWebStorageRoomStore,
} from "../../src/index.js";

class FakeStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("collab room store — browser-compatible stores", () => {
  it("memory store copies snapshots on save and load", () => {
    const store = createMemoryRoomStore();
    const original = new Uint8Array([1, 2, 3]);
    store.save("room", original);
    original[0] = 9;

    const loaded = store.load("room");
    expect(loaded).not.toBeNull();
    if (loaded === null) throw new Error("no loaded snapshot");
    expect([...loaded]).toEqual([1, 2, 3]);

    loaded[1] = 8;
    expect([...(store.load("room") ?? new Uint8Array())]).toEqual([1, 2, 3]);
  });

  it("web storage store round-trips a binary snapshot by room", () => {
    const storage = new FakeStorage();
    const store = createWebStorageRoomStore(storage, "test-room:");
    expect(store.load("tenant/a")).toBeNull();

    store.save("tenant/a", new Uint8Array([0, 255, 17, 42]));
    store.save("tenant/b", new Uint8Array([7]));

    expect([...(store.load("tenant/a") ?? new Uint8Array())]).toEqual([0, 255, 17, 42]);
    expect([...(store.load("tenant/b") ?? new Uint8Array())]).toEqual([7]);
    expect(storage.key(0)).toMatch(/^test-room:tenant%2Fa$/);
  });

  it("a stored Yjs snapshot hydrates a new collab session", () => {
    const store = createMemoryRoomStore();
    const first = createCollabSession({
      initialOverrides: new Map(),
      initialGroups: new Map(),
      initialSource: "flowchart TD\n  A --> B\n",
      save: () => {},
    });
    first.setSource("flowchart TD\n  Saved --> Room\n");
    store.save("demo", first.state());
    first.destroy();

    const second = createCollabSession({
      initialOverrides: new Map(),
      initialGroups: new Map(),
      initialSource: "ignored seed",
      initialUpdate: store.load("demo") ?? new Uint8Array(),
      save: () => {},
    });
    expect(second.source()).toBe("flowchart TD\n  Saved --> Room\n");
    second.destroy();
  });
});

describe("collab room store — IndexedDB (async)", () => {
  it("round-trips a binary snapshot by room, and misses cleanly", async () => {
    const store = await createIndexedDbRoomStore(new IDBFactory(), "test-db");
    expect(await store.load("tenant/a")).toBeNull();

    await store.save("tenant/a", new Uint8Array([0, 255, 17, 42]));
    await store.save("tenant/b", new Uint8Array([7]));

    expect([...((await store.load("tenant/a")) ?? new Uint8Array())]).toEqual([0, 255, 17, 42]);
    expect([...((await store.load("tenant/b")) ?? new Uint8Array())]).toEqual([7]);
  });

  it("copies snapshots on save and load, so later mutation of either side is invisible to the store", async () => {
    const store = await createIndexedDbRoomStore(new IDBFactory(), "test-db");
    const original = new Uint8Array([1, 2, 3]);
    await store.save("room", original);
    original[0] = 9; // mutate the caller's array after save

    const loaded = await store.load("room");
    expect(loaded).not.toBeNull();
    if (loaded === null) throw new Error("no loaded snapshot");
    expect([...loaded]).toEqual([1, 2, 3]);

    loaded[1] = 8; // mutate the returned array
    expect([...((await store.load("room")) ?? new Uint8Array())]).toEqual([1, 2, 3]);
  });

  it("persists across separate store handles opened against the same factory (~ a page reload)", async () => {
    const factory = new IDBFactory();
    const first = await createIndexedDbRoomStore(factory, "test-db");
    await first.save("demo", new Uint8Array([1, 2, 3]));

    const second = await createIndexedDbRoomStore(factory, "test-db");
    expect([...((await second.load("demo")) ?? new Uint8Array())]).toEqual([1, 2, 3]);
  });

  it("a stored Yjs snapshot hydrates a new collab session", async () => {
    const store = await createIndexedDbRoomStore(new IDBFactory(), "test-db");
    const first = createCollabSession({
      initialOverrides: new Map(),
      initialGroups: new Map(),
      initialSource: "flowchart TD\n  A --> B\n",
      save: () => {},
    });
    first.setSource("flowchart TD\n  Saved --> Room\n");
    await store.save("demo", first.state());
    first.destroy();

    const second = createCollabSession({
      initialOverrides: new Map(),
      initialGroups: new Map(),
      initialSource: "ignored seed",
      initialUpdate: (await store.load("demo")) ?? new Uint8Array(),
      save: () => {},
    });
    expect(second.source()).toBe("flowchart TD\n  Saved --> Room\n");
    second.destroy();
  });

  it("rejects a non-binary value found in the object store instead of returning it silently", async () => {
    const factory = new IDBFactory();
    const store = await createIndexedDbRoomStore(factory, "test-db");
    // Reach past the store's own `save` (which only ever writes a Uint8Array) to put a value of the
    // wrong shape directly, simulating data that predates this store's format or was written by
    // something else sharing the database.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open("test-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("rooms", "readwrite");
      tx.objectStore("rooms").put("not binary", "corrupt-room");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    await expect(store.load("corrupt-room")).rejects.toThrow(/non-binary snapshot/);
  });
});
