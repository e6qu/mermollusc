// Room persistence for the collaborative server. A `RoomStore` is the durability seam: the relay loads
// a room's last snapshot on first join and saves it as the room changes, so rooms survive a restart.
//
//   load(room)            -> Uint8Array snapshot, or null if the room is new
//   save(room, snapshot)  -> persist the latest whole-document snapshot
//
// Two implementations ship here: an in-memory store (the zero-config default — durability only within a
// process lifetime) and a file store (snapshots on disk). The production target is Postgres (update log)
// + S3 (snapshots) per the decisions in docs/collab-editor-plan.md §10.3; that implementation satisfies
// the same interface and drops in without touching the relay.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const createMemoryStore = () => {
  const snapshots = new Map();
  return {
    load: (room) => snapshots.get(room) ?? null,
    save: (room, snapshot) => {
      snapshots.set(room, snapshot);
    },
  };
};

export const createFileStore = (dir) => {
  mkdirSync(dir, { recursive: true });
  // Encode the room name so an arbitrary id is a safe single filename (no path traversal / separators).
  const fileFor = (room) => join(dir, `${encodeURIComponent(room)}.bin`);
  return {
    load: (room) => {
      const file = fileFor(room);
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
    },
    save: (room, snapshot) => {
      writeFileSync(fileFor(room), snapshot);
    },
  };
};
