// Durability primitive for the collab server's persistence. Plain ESM (the server is .mjs ops tooling),
// run by vitest. Proves the `RoomStore` contract — and, crucially, that a *fresh* file store over the
// same directory loads what a previous one saved (the across-restart guarantee the relay relies on).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFileStore, createMemoryStore } from "../../server/store.mjs";

describe("collab room store — memory", () => {
  it("returns null for an unknown room, then the saved snapshot", () => {
    const store = createMemoryStore();
    expect(store.load("r")).toBeNull();
    store.save("r", new Uint8Array([1, 2, 3]));
    expect([...store.load("r")]).toEqual([1, 2, 3]);
  });

  it("keeps rooms independent", () => {
    const store = createMemoryStore();
    store.save("a", new Uint8Array([1]));
    store.save("b", new Uint8Array([2]));
    expect([...store.load("a")]).toEqual([1]);
    expect([...store.load("b")]).toEqual([2]);
  });
});

describe("collab room store — file (survives a fresh instance ≈ restart)", () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "collab-store-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists a snapshot a brand-new store over the same dir then loads", () => {
    const first = createFileStore(dir);
    expect(first.load("durable")).toBeNull();
    first.save("durable", new Uint8Array([9, 8, 7, 6]));

    // a new store instance over the same directory == what a relay sees after a restart
    const second = createFileStore(dir);
    expect([...second.load("durable")]).toEqual([9, 8, 7, 6]);
  });

  it("isolates rooms by a path-safe filename (no traversal from the room id)", () => {
    const store = createFileStore(dir);
    store.save("a/../b", new Uint8Array([5]));
    expect([...store.load("a/../b")]).toEqual([5]);
    expect(store.load("b")).toBeNull(); // the slash didn't escape into a separate file
  });
});
