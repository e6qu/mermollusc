import { describe, expect, it } from "vitest";
import { createCollabSession, createMemoryRoomStore, createWebStorageRoomStore } from "../../src/index.js";

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
