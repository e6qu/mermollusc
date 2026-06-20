// Dev relay for the collaborative editor — a server-authoritative WebSocket that rooms by URL path,
// keeps a Y.Doc per room, and converges every client in it. It is the Phase-1 transport: no auth, no
// persistence, no presence (those are Phases 2–3 of docs/collab-editor-plan.md). The eventual
// production server (Hocuspocus) replaces this; the wire protocol — raw binary Yjs updates, plus the
// room's full state on join — is the same the `connectTransport` client speaks.
//
//   PORT=1234 node modules/collab/dev-server.mjs
//
// This is dev/test tooling (run by Playwright + `make collab-server`), not shipped app code, so it
// lives outside src/ and is plain ESM — not under the strict typecheck/lint that governs the module.

import { WebSocketServer } from "ws";
import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";

const PORT = Number(process.env.PORT ?? "1234");

// room name → { doc, sockets }. A room is created on first join and dropped when its last client
// leaves (the doc is in-memory only — restarting the relay clears all rooms, which is fine for dev).
const rooms = new Map();

const roomName = (req) => decodeURIComponent((req.url ?? "/").replace(/^\/+/, "")) || "default";

// Frames are [tag][payload]: tag 0 = document (CRDT) update, tag 1 = presence (awareness) update.
const DOC = 0;

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

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket, req) => {
  const name = roomName(req);
  let room = rooms.get(name);
  if (room === undefined) {
    room = { doc: new Doc(), sockets: new Set() };
    rooms.set(name, room);
  }
  room.sockets.add(socket);

  // Bring the newcomer up to the room's current document state (presence catches up as peers update).
  socket.send(docFrame(encodeStateAsUpdate(room.doc)));

  socket.on("message", (data) => {
    const frame = bytes(data);
    if (frame.byteLength === 0) return;
    // Keep the room document current for future joiners; presence is ephemeral and only relayed.
    if (frame[0] === DOC) applyUpdate(room.doc, frame.subarray(1));
    for (const peer of room.sockets) {
      if (peer !== socket && peer.readyState === peer.OPEN) peer.send(frame);
    }
  });

  socket.on("close", () => {
    room.sockets.delete(socket);
    if (room.sockets.size === 0) rooms.delete(name);
  });
});

wss.on("listening", () => {
  const addr = wss.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : PORT;
  console.log(`collab dev relay listening on localhost:${port} (WebSocket)`);
});
