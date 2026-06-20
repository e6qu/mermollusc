// Server-authoritative WebSocket relay for the collaborative editor. Rooms by URL path, a Y.Doc per
// room, every client in a room converges. The wire protocol — the room's full state on join, then
// [tag][payload] frames (tag 0 = document/CRDT, tag 1 = presence/awareness) — is what the
// `connectTransport` client speaks.
//
//   PORT=1234 PERSIST_DIR=.collab-data node modules/collab/server/relay.mjs
//
// Durability: a `RoomStore` (store.mjs) loads a room's last snapshot on first join and saves it as the
// room changes, so rooms survive a restart. PERSIST_DIR selects the file store; unset = in-memory
// (zero-config dev). Auth: `authorize(req)` gates every connection — it defaults to allow-all here; the
// Auth0 OIDC handshake plugs in there (decisions §10.4). This server is OPTIONAL: the app runs fully
// single-user with no relay, no persistence, no auth. It is dev/ops tooling (plain ESM, outside src/),
// not strictly typechecked.

import { WebSocketServer } from "ws";
import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import { createFileStore, createMemoryStore } from "./store.mjs";

const DOC = 0; // frame tag: document update (tag 1 = presence, relayed but not persisted)
const SAVE_DEBOUNCE_MS = 400;

const bytes = (data) =>
  data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const docFrame = (payload) => {
  const frame = new Uint8Array(payload.byteLength + 1);
  frame[0] = DOC;
  frame.set(payload, 1);
  return frame;
};

const roomName = (req) => decodeURIComponent((req.url ?? "/").replace(/^\/+/, "")) || "default";

// Start the relay. `store` is the durability seam; `authorize(req) -> boolean` gates connections. Both
// are injected so a test (or the Auth0 build) can swap them. Returns the WebSocketServer.
export const startRelay = ({ port = 0, store = createMemoryStore(), authorize = () => true } = {}) => {
  // room name → { doc, sockets, saveTimer }
  const rooms = new Map();
  const wss = new WebSocketServer({ port });

  const loadRoom = (name) => {
    let room = rooms.get(name);
    if (room !== undefined) return room;
    const doc = new Doc();
    const snapshot = store.load(name);
    if (snapshot !== null) applyUpdate(doc, snapshot);
    room = { doc, sockets: new Set(), saveTimer: null };
    rooms.set(name, room);
    return room;
  };

  const flush = (name, room) => {
    if (room.saveTimer !== null) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    store.save(name, encodeStateAsUpdate(room.doc));
  };

  wss.on("connection", (socket, req) => {
    if (!authorize(req)) {
      socket.close(1008, "unauthorized"); // 1008 = policy violation
      return;
    }
    const name = roomName(req);
    const room = loadRoom(name);
    room.sockets.add(socket);

    // Bring the newcomer up to the room's current document state (presence catches up as peers update).
    socket.send(docFrame(encodeStateAsUpdate(room.doc)));

    socket.on("message", (data) => {
      const frame = bytes(data);
      if (frame.byteLength === 0) return;
      if (frame[0] === DOC) {
        applyUpdate(room.doc, frame.subarray(1));
        // Debounce the snapshot save so a burst of keystrokes is one write.
        if (room.saveTimer !== null) clearTimeout(room.saveTimer);
        room.saveTimer = setTimeout(() => {
          room.saveTimer = null;
          store.save(name, encodeStateAsUpdate(room.doc));
        }, SAVE_DEBOUNCE_MS);
      }
      for (const peer of room.sockets) {
        if (peer !== socket && peer.readyState === peer.OPEN) peer.send(frame);
      }
    });

    socket.on("close", () => {
      room.sockets.delete(socket);
      if (room.sockets.size === 0) {
        flush(name, room); // persist the final state before dropping the room from memory
        rooms.delete(name);
      }
    });
  });

  return wss;
};

// Run directly: `node relay.mjs`. Wires the env-selected store and the default (allow-all) authorizer.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? "1234");
  const persistDir = process.env.PERSIST_DIR;
  const store = persistDir ? createFileStore(persistDir) : createMemoryStore();
  const wss = startRelay({ port, store });
  wss.on("listening", () => {
    const addr = wss.address();
    const actual = typeof addr === "object" && addr !== null ? addr.port : port;
    const mode = persistDir ? `file:${persistDir}` : "memory";
    console.log(`collab relay listening on localhost:${actual} (WebSocket, persistence=${mode})`);
  });
}
