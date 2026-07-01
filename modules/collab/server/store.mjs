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

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const copy = (bytes) => new Uint8Array(bytes);

export const createMemoryRoomStore = () => {
  const snapshots = new Map();
  return {
    load: (room) => {
      const snapshot = snapshots.get(room);
      return snapshot === undefined ? null : copy(snapshot);
    },
    save: (room, snapshot) => {
      snapshots.set(room, copy(snapshot));
    },
  };
};

export const createFileRoomStore = (dir) => {
  mkdirSync(dir, { recursive: true });
  // Encode the room name so an arbitrary id is a safe single filename (no path traversal / separators).
  const fileFor = (room) => join(dir, `${encodeURIComponent(room)}.bin`);
  return {
    load: (room) => {
      const file = fileFor(room);
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
    },
    // Write to a temp file then rename into place: a crash mid-write leaves the old snapshot intact
    // rather than a truncated/corrupt one (rename is atomic on the same filesystem).
    save: (room, snapshot) => {
      const file = fileFor(room);
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, snapshot);
      renameSync(tmp, file);
    },
  };
};

export const createMemoryStore = createMemoryRoomStore;
export const createFileStore = createFileRoomStore;
