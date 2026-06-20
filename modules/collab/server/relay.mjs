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
import { createAuth0Authorizer } from "./auth.mjs";
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

// The room is the URL path (the query carries `?token=`, consumed by `authorize`).
const roomName = (req) => {
  const path = new URL(req.url ?? "/", "http://relay.invalid").pathname;
  return decodeURIComponent(path.replace(/^\/+/, "")) || "default";
};

// `authorize` may be sync (the default) or async (the Auth0 verifier) and may return a boolean or a
// `{ ok, user, reason }` object — normalise to a Promise of that shape.
const runAuthorize = async (authorize, req) => {
  const result = await authorize(req);
  return result === true ? { ok: true } : result === false ? { ok: false } : result;
};

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
    // Authorization may be async (JWKS fetch), so buffer any frames the client sends before it resolves,
    // then replay them once the connection is admitted. A rejection closes the socket (1008 = policy).
    let phase = "pending"; // pending | open | closed
    const pending = [];
    let room = null;
    let name = "";

    const handle = (data) => {
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
    };

    socket.on("message", (data) => {
      if (phase === "open") handle(data);
      else if (phase === "pending") pending.push(data);
    });
    socket.on("close", () => {
      phase = "closed";
      if (room === null) return;
      room.sockets.delete(socket);
      if (room.sockets.size === 0) {
        flush(name, room); // persist the final state before dropping the room from memory
        rooms.delete(name);
      }
    });

    runAuthorize(authorize, req).then(
      (auth) => {
        if (phase === "closed") return; // client gave up while we verified
        if (!auth.ok) {
          console.warn(`collab relay: rejected connection (${auth.reason ?? "unauthorized"})`);
          phase = "closed";
          socket.close(1008, "unauthorized");
          return;
        }
        name = roomName(req);
        room = loadRoom(name);
        room.sockets.add(socket);
        phase = "open";
        // Bring the newcomer up to the room's current document state.
        socket.send(docFrame(encodeStateAsUpdate(room.doc)));
        for (const data of pending) handle(data);
        pending.length = 0;
      },
      (e) => {
        console.error("collab relay: authorize threw —", e instanceof Error ? e.message : e);
        phase = "closed";
        socket.close(1011, "auth error"); // 1011 = internal error
      },
    );
  });

  return wss;
};

// Run directly: `node relay.mjs`. Wires the env-selected store + authorizer. Auth is OFF unless both
// AUTH0_DOMAIN and AUTH0_AUDIENCE are set (so local dev / e2e stay zero-auth); when set, every
// connection must present a valid Auth0 token (`?token=`).
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? "1234");
  const persistDir = process.env.PERSIST_DIR;
  const store = persistDir ? createFileStore(persistDir) : createMemoryStore();
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  const authorize = domain && audience ? createAuth0Authorizer({ domain, audience }) : () => true;
  const wss = startRelay({ port, store, authorize });
  wss.on("listening", () => {
    const addr = wss.address();
    const actual = typeof addr === "object" && addr !== null ? addr.port : port;
    const mode = persistDir ? `file:${persistDir}` : "memory";
    const auth = domain && audience ? `auth0:${domain}` : "none";
    console.log(`collab relay listening on localhost:${actual} (WebSocket, persistence=${mode}, auth=${auth})`);
  });
}
