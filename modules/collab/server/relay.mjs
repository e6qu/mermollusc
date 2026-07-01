// Server-authoritative WebSocket relay for the collaborative editor. Rooms by URL path, a Y.Doc per
// room, every client in a room converges. The wire protocol — the room's full state on join, then
// [tag][payload] frames (tag 0 = document/CRDT, tag 1 = presence/awareness) — is what the
// `connectTransport` client speaks.
//
//   PORT=1234 PERSIST_DIR=.collab-data node modules/collab/server/relay.mjs
//
// Durability: a `RoomStore` (store.mjs) loads a room's last snapshot on first join and saves it as the
// room changes, so rooms survive a restart. PERSIST_DIR selects the file store; unset = in-memory
// (zero-config dev). On SIGINT/SIGTERM the relay flushes every dirty room before exit, so a clean
// shutdown never loses the post-debounce edits. Auth: `authorize(req)` gates every connection — it
// defaults to allow-all here; the Auth0 OIDC handshake plugs in there (decisions §10.4). This server
// is OPTIONAL: the app runs fully single-user with no relay, no persistence, no auth. It is dev/ops
// tooling (plain ESM, outside src/), not strictly typechecked.

import { WebSocketServer } from "ws";
import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import { createAuth0Authorizer } from "./auth.mjs";
import { canWrite, createClaimsRoleResolver } from "./rbac.mjs";
import { createFileRoomStore, createMemoryRoomStore } from "./store.mjs";

// Frame-tag allow-list. A relayed frame is broadcast only when its leading byte is a known channel the
// relay understands; unknown tags (and CONTROL, which only ever flows server→client) are dropped.
const DOC = 0; // document update (CRDT) — applied to the room Doc and broadcast
const AWARE = 1; // presence/awareness — broadcast but never persisted
const CONTROL = 2; // server→client control channel (e.g. the granted role) — never relayed inbound
const SAVE_DEBOUNCE_MS = 400;
// Abuse limits. A single frame is capped at the WebSocket layer (`maxPayload`); the pre-auth buffer
// (frames a client sends before its token verifies) is bounded so an unauthenticated peer can't OOM
// the process; and the room count is capped so it can't be exhausted by connecting to endless paths.
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_FRAMES = 64;
const MAX_ROOMS = 10_000;
// Per-socket post-auth rate limit (a token bucket on BOTH frames/sec and bytes/sec). A flood of
// presence (or document) frames is throttled by closing the socket 1008 on breach. Both ceilings are
// injectable knobs (`rateLimit`) so a test can drive them low and production can tune them.
const DEFAULT_RATE_LIMIT = { framesPerSec: 200, bytesPerSec: 4 * 1024 * 1024 };
// How often a viewer-edit drop is logged per socket — one warn, then silence for the window, so a
// viewer holding a key down can't flood the relay log.
const VIEWER_DROP_LOG_MS = 5_000;
// `<tenant>/<id>` grammar (or a bare single-segment id). Segments are URL-safe-ish word/dot/dash/tilde
// runs; empty segments, `.`/`..`, and >2 segments are rejected at the boundary (no normalisation).
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

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

const controlFrame = (message) => {
  const payload = new TextEncoder().encode(message);
  const frame = new Uint8Array(payload.byteLength + 1);
  frame[0] = CONTROL;
  frame.set(payload, 1);
  return frame;
};

// The room is the URL path (the query carries `?token=`, consumed by `authorize`). Returns the decoded
// room name, or null if it is malformed — the caller rejects rather than normalising a bad name.
const roomName = (req) => {
  const path = new URL(req.url ?? "/", "http://relay.invalid").pathname;
  const raw = decodeURIComponent(path.replace(/^\/+/, ""));
  if (raw.length === 0) return "default";
  return validRoomName(raw) ? raw : null;
};

// A room id is one or two non-empty `<tenant>/<id>` segments; `.`/`..` and empty segments are barred so
// the name can't traverse the store's file layout or smuggle an empty tenant past RBAC's prefix check.
const validRoomName = (name) => {
  const segments = name.split("/");
  if (segments.length === 0 || segments.length > 2) return false;
  for (const seg of segments) {
    if (seg.length === 0 || seg === "." || seg === "..") return false;
    if (!SEGMENT.test(seg)) return false;
  }
  return true;
};

// `authorize` may be sync (the default) or async (the Auth0 verifier) and may return a boolean or a
// `{ ok, user, reason }` object — normalise to a Promise of that shape.
const runAuthorize = async (authorize, req) => {
  const result = await authorize(req);
  return result === true ? { ok: true } : result === false ? { ok: false } : result;
};

// A per-socket token bucket over frames AND bytes. `take(byteLength)` refills both buckets by elapsed
// time, then debits one frame + the frame's bytes; returns false (breach) if either bucket is empty.
const createRateBucket = ({ framesPerSec, bytesPerSec }, now) => {
  let frameTokens = framesPerSec;
  let byteTokens = bytesPerSec;
  let last = now();
  return (byteLength) => {
    const t = now();
    const elapsed = Math.max(0, t - last) / 1000;
    last = t;
    frameTokens = Math.min(framesPerSec, frameTokens + elapsed * framesPerSec);
    byteTokens = Math.min(bytesPerSec, byteTokens + elapsed * bytesPerSec);
    if (frameTokens < 1 || byteTokens < byteLength) return false;
    frameTokens -= 1;
    byteTokens -= byteLength;
    return true;
  };
};

// Start the relay. `store` is the durability seam; `authorize(req)` gates the connection (returns
// `{ ok, user }`); `authorizeRoom({ user, room })` decides the per-document role (or null = no access);
// `rateLimit` caps per-socket frames/sec + bytes/sec; `now` is the injectable clock (the rate bucket's
// only impurity). All injected so a test or the production build can swap them. Returns the
// WebSocketServer.
export const startRelay = ({
  port = 0,
  store = createMemoryRoomStore(),
  authorize = () => true,
  authorizeRoom = createClaimsRoleResolver({ defaultRole: "editor" }),
  rateLimit = DEFAULT_RATE_LIMIT,
  now = () => Date.now(),
} = {}) => {
  // room name → { doc, sockets, saveTimer }
  const rooms = new Map();
  const wss = new WebSocketServer({ port, maxPayload: MAX_FRAME_BYTES });
  // A transport-layer fault on the server itself (e.g. EADDRINUSE, an internal ws error) must not reach
  // `uncaughtException` and crash the process — log it loudly and keep serving the rooms we have.
  wss.on("error", (e) => {
    console.error("collab relay: server error —", e instanceof Error ? e.message : e);
  });

  // Load a room (from the store on first touch). Returns null if the room cap is hit and the room is
  // new — the caller rejects the connection rather than letting room count grow without bound.
  const loadRoom = (name) => {
    let room = rooms.get(name);
    if (room !== undefined) return room;
    if (rooms.size >= MAX_ROOMS) return null;
    const doc = new Doc();
    const snapshot = safeLoad(name);
    if (snapshot !== null) applyUpdate(doc, snapshot);
    room = { doc, sockets: new Set(), saveTimer: null };
    rooms.set(name, room);
    return room;
  };

  // Store IO is the shell boundary: a failure (EACCES, ENOSPC, corrupt file) is logged loudly and
  // contained, never swallowed silently and never allowed to crash the process from a timer callback.
  const safeLoad = (name) => {
    try {
      return store.load(name);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`collab relay: store.load("${name}") failed — ${detail}`);
      return null;
    }
  };
  const safeSave = (name, room) => {
    try {
      store.save(name, encodeStateAsUpdate(room.doc));
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`collab relay: store.save("${name}") failed — ${detail}`);
    }
  };

  const flush = (name, room) => {
    if (room.saveTimer !== null) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    safeSave(name, room);
  };

  wss.on("connection", (socket, req) => {
    // Authorization may be async (JWKS fetch), so buffer any frames the client sends before it resolves,
    // then replay them once the connection is admitted. A rejection closes the socket (1008 = policy).
    let phase = "pending"; // pending | open | closed
    const pending = [];
    let room = null;
    let name = "";
    let role = null; // owner | editor | viewer, set once admitted
    const allow = createRateBucket(rateLimit, now);
    let lastViewerDropLog = 0;

    const handle = (data) => {
      const frame = bytes(data);
      if (frame.byteLength === 0) return;
      // Per-socket rate limit on ALL post-auth frames (document + presence): a flood is a policy
      // breach, not silently absorbed.
      if (!allow(frame.byteLength)) return reject(1008, "rate limit exceeded");
      const tag = frame[0];
      // Tag allow-list: only document and presence frames are relayed. CONTROL is server-originated;
      // an unknown tag is noise. Either is dropped (one warn for an unexpected tag, then silence).
      if (tag !== DOC && tag !== AWARE) {
        const t = now();
        if (t - lastViewerDropLog >= VIEWER_DROP_LOG_MS) {
          lastViewerDropLog = t;
          console.warn(`collab relay: dropped frame with unknown tag ${tag} in room "${name}"`);
        }
        return;
      }
      if (tag === DOC) {
        if (!canWrite(role)) {
          // Viewers are read-only — drop their document edits. Log throttled so a viewer holding a key
          // down can't flood the relay log.
          const t = now();
          if (t - lastViewerDropLog >= VIEWER_DROP_LOG_MS) {
            lastViewerDropLog = t;
            console.warn(`collab relay: dropped doc edit from viewer in room "${name}"`);
          }
          return;
        }
        // A malformed CRDT update makes `applyUpdate` throw; without this guard the throw escapes the
        // ws message handler as `uncaughtException` and crashes the whole relay (taking every room with
        // it). Contain it: log loudly and DROP the frame (return before re-broadcast) so one bad client
        // can't poison the room or the process.
        try {
          applyUpdate(room.doc, frame.subarray(1));
        } catch (e) {
          console.error(
            `collab relay: malformed doc update in room "${name}" — ${
              e instanceof Error ? e.message : e
            }`,
          );
          return;
        }
        // Debounce the snapshot save so a burst of keystrokes is one write.
        if (room.saveTimer !== null) clearTimeout(room.saveTimer);
        room.saveTimer = setTimeout(() => {
          room.saveTimer = null;
          safeSave(name, room);
        }, SAVE_DEBOUNCE_MS);
      }
      // DOC and AWARE frames relay to peers (presence relays even from a viewer, so others see who is
      // looking).
      for (const peer of room.sockets) {
        if (peer !== socket && peer.readyState === peer.OPEN) peer.send(frame);
      }
    };

    socket.on("message", (data) => {
      if (phase === "open") handle(data);
      else if (phase === "pending") {
        // Bound the pre-auth buffer: a client that floods frames before its token verifies is dropped
        // rather than allowed to grow `pending` without limit.
        if (pending.length >= MAX_PENDING_FRAMES) reject(1008, "flood before auth");
        else pending.push(data);
      }
    });
    // A transport fault (RST, protocol error, frame-decode failure) emits `error`; without a listener
    // `ws` re-raises it as `uncaughtException`, crashing the process. Log it and let the paired `close`
    // event run the teardown.
    socket.on("error", (e) => {
      console.error("collab relay: socket error —", e instanceof Error ? e.message : e);
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

    const reject = (code, reason) => {
      console.warn(`collab relay: rejected connection (${reason})`);
      phase = "closed";
      socket.close(code, reason);
    };

    (async () => {
      let auth;
      try {
        auth = await runAuthorize(authorize, req);
      } catch (e) {
        console.error("collab relay: authorize threw —", e instanceof Error ? e.message : e);
        phase = "closed";
        socket.close(1011, "auth error"); // 1011 = internal error
        return;
      }
      if (phase === "closed") return; // client gave up while we verified
      if (!auth.ok) return reject(1008, auth.reason ?? "unauthorized");

      name = roomName(req);
      if (name === null) return reject(1008, "invalid room name");
      let resolved;
      try {
        resolved = await authorizeRoom({ user: auth.user ?? null, room: name });
      } catch (e) {
        console.error("collab relay: authorizeRoom threw —", e instanceof Error ? e.message : e);
        phase = "closed";
        socket.close(1011, "rbac error");
        return;
      }
      if (phase === "closed") return;
      if (resolved === null || resolved === undefined) return reject(1008, `forbidden: ${name}`);

      const loaded = loadRoom(name);
      if (loaded === null) return reject(1013, "server full"); // 1013 = try again later
      role = resolved;
      room = loaded;
      room.sockets.add(socket);
      phase = "open";
      // The socket may have closed during the async verification — its `close` handler ran while
      // `room` was still null, so it couldn't remove this now-registered socket. Reconcile here so a
      // dead socket can't keep an otherwise-empty room (and its Doc) alive forever.
      if (socket.readyState !== socket.OPEN) {
        phase = "closed";
        room.sockets.delete(socket);
        if (room.sockets.size === 0) {
          flush(name, room);
          rooms.delete(name);
        }
        return;
      }
      // Tell the client its granted role (so it can present read-only UI for a viewer), then bring it
      // up to the room's current document state.
      socket.send(controlFrame(role));
      socket.send(docFrame(encodeStateAsUpdate(room.doc)));
      for (const data of pending) handle(data);
      pending.length = 0;
    })();
  });

  // Flush every dirty room's latest snapshot. The durability guarantee: an edit is durable once its
  // debounce timer fires, the room empties, OR the relay shuts down cleanly (SIGINT/SIGTERM); an edit
  // in the open debounce window when the process is hard-killed (SIGKILL/crash) is lost.
  wss.flushAll = () => {
    for (const [name, room] of rooms) flush(name, room);
  };

  return wss;
};

// Run directly: `node relay.mjs`. Wires the env-selected store + authorizer. Auth is OFF unless both
// AUTH0_DOMAIN and AUTH0_AUDIENCE are set (so local dev / e2e stay zero-auth); when set, every
// connection must present a valid Auth0 token (`?token=`).
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? "1234");
  const persistDir = process.env.PERSIST_DIR;
  const store = persistDir ? createFileRoomStore(persistDir) : createMemoryRoomStore();
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  // Auth is on only when both Auth0 env vars are set. When OFF, a verified token can't exist, so we
  // grant role-less users `editor` (dev/e2e). When ON, the resolver fails closed (defaultRole null):
  // a verified token lacking a per-room role is denied, never silently promoted to editor.
  const authEnabled = Boolean(domain && audience);
  const authorize = authEnabled ? createAuth0Authorizer({ domain, audience }) : () => true;
  const authorizeRoom = createClaimsRoleResolver({ defaultRole: authEnabled ? null : "editor" });
  const wss = startRelay({ port, store, authorize, authorizeRoom });
  wss.on("listening", () => {
    const addr = wss.address();
    const actual = typeof addr === "object" && addr !== null ? addr.port : port;
    const mode = persistDir ? `file:${persistDir}` : "memory";
    const auth = authEnabled ? `auth0:${domain}` : "none";
    console.log(`collab relay listening on localhost:${actual} (WebSocket, persistence=${mode}, auth=${auth})`);
  });
  // Flush all dirty rooms on a clean shutdown so a SIGINT/SIGTERM doesn't drop the post-debounce edits.
  const shutdown = (signal) => {
    console.log(`collab relay: ${signal} — flushing rooms and closing`);
    wss.flushAll();
    wss.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
