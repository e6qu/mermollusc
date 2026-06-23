// Relay integration: the security-critical enforcement wired end-to-end through a real socket —
// RBAC viewers are read-only, forbidden rooms are refused, and the granted role is announced. Drives
// `startRelay` with injected authorizers and a raw client. Plain ESM (the server is .mjs), run by
// vitest. The relay is local-only, so the client speaks plain `ws` (no TLS by design).

import { Doc, encodeStateAsUpdate } from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { startRelay } from "../../server/relay.mjs";

const WS = "ws"; // localhost test relay: plain ws, no TLS
const DOC = 0;
const CONTROL = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = (tag, payload) => {
  const f = new Uint8Array(payload.byteLength + 1);
  f[0] = tag;
  f.set(payload, 1);
  return f;
};
const docUpdate = (text) => {
  const d = new Doc();
  d.getText("source").insert(0, text);
  return encodeStateAsUpdate(d);
};

const AWARE = 1;

const servers = [];
const sockets = [];
const start = (opts) => {
  const wss = startRelay(opts);
  servers.push(wss);
  return new Promise((res) => wss.on("listening", () => res(wss.address().port)));
};
// Open a socket to a given path (defaults to a valid room). Resolves on open; if the relay rejects
// before open (e.g. an invalid room name closes 1008 immediately), resolves on close so the test can
// inspect the close code.
const openPath = (port, path = "/board") =>
  new Promise((res) => {
    const ws = new WebSocket(`${WS}://localhost:${port}${path}`);
    ws.binaryType = "arraybuffer";
    sockets.push(ws);
    ws.addEventListener("open", () => res(ws));
    ws.addEventListener("close", () => res(ws));
  });
const open = (port) => openPath(port);

afterEach(() => {
  for (const s of sockets.splice(0)) s.close();
  for (const w of servers.splice(0)) w.close();
});

describe("relay — RBAC enforcement over a real socket", () => {
  it("announces the granted role as the first control frame", async () => {
    const port = await start({ authorizeRoom: () => "viewer" });
    const ws = await open(port);
    const got = [];
    ws.addEventListener("message", (e) => {
      const b = new Uint8Array(e.data);
      if (b[0] === CONTROL) got.push(new TextDecoder().decode(b.subarray(1)));
    });
    await sleep(150);
    expect(got).toContain("viewer");
  });

  it("drops a viewer's document edits (read-only) but relays an editor's", async () => {
    const viewerPort = await start({ authorizeRoom: () => "viewer" });
    const va = await open(viewerPort);
    const vb = await open(viewerPort);
    let vbDocs = 0;
    vb.addEventListener("message", (e) => {
      const b = new Uint8Array(e.data);
      if (b[0] === DOC && b.byteLength > 1) vbDocs += 1;
    });
    await sleep(120);
    const baseline = vbDocs;
    va.send(frame(DOC, docUpdate("viewer edit")));
    await sleep(150);
    expect(vbDocs - baseline).toBe(0); // a viewer's edit never reaches the peer

    const editorPort = await start({ authorizeRoom: () => "editor" });
    const ea = await open(editorPort);
    const eb = await open(editorPort);
    let ebDocs = 0;
    eb.addEventListener("message", (e) => {
      const b = new Uint8Array(e.data);
      if (b[0] === DOC && b.byteLength > 1) ebDocs += 1;
    });
    await sleep(120);
    const base2 = ebDocs;
    ea.send(frame(DOC, docUpdate("editor edit")));
    await sleep(150);
    expect(ebDocs - base2).toBeGreaterThanOrEqual(1); // an editor's edit propagates
  });

  it("refuses a forbidden room (no role) by closing 1008", async () => {
    const port = await start({ authorizeRoom: () => null });
    const ws = await open(port);
    let code = null;
    ws.addEventListener("close", (e) => {
      code = e.code;
    });
    await sleep(200);
    expect(code).toBe(1008);
  });

  it("rejects a connection whose token fails verification", async () => {
    const port = await start({ authorize: () => ({ ok: false, reason: "bad token" }) });
    const ws = await open(port);
    let code = null;
    ws.addEventListener("close", (e) => {
      code = e.code;
    });
    await sleep(200);
    expect(code).toBe(1008);
  });
});

describe("relay — hardening", () => {
  it("survives a malformed CRDT update instead of crashing (crash guard)", async () => {
    const port = await start({ authorizeRoom: () => "editor" });
    const a = await open(port);
    const b = await open(port);
    await sleep(120);
    // Garbage bytes behind a DOC tag are not a valid Yjs update — applyUpdate throws; the guard must
    // contain it. The relay stays up: a subsequent valid edit still propagates to the peer.
    a.send(frame(DOC, new Uint8Array([255, 254, 253, 1, 2, 3])));
    await sleep(80);
    let bDocs = 0;
    b.addEventListener("message", (e) => {
      const by = new Uint8Array(e.data);
      if (by[0] === DOC && by.byteLength > 1) bDocs += 1;
    });
    a.send(frame(DOC, docUpdate("still alive")));
    await sleep(150);
    expect(bDocs).toBeGreaterThanOrEqual(1); // relay survived and kept relaying
  });

  it("rejects a room name with a `..` segment with 1008 (no normalisation)", async () => {
    const port = await start({ authorizeRoom: () => "editor" });
    // Percent-encode the slashes so the URL parser doesn't collapse `..` before the relay validates the
    // decoded name — the relay must reject the `..` traversal segment itself.
    const ws = await openPath(port, "/a%2F..%2Fb");
    let code = null;
    ws.addEventListener("close", (e) => {
      code = e.code;
    });
    await sleep(200);
    expect(code).toBe(1008);
  });

  it("rejects a room name with an empty segment with 1008", async () => {
    const port = await start({ authorizeRoom: () => "editor" });
    const ws = await openPath(port, "/a//b");
    let code = null;
    ws.addEventListener("close", (e) => {
      code = e.code;
    });
    await sleep(200);
    expect(code).toBe(1008);
  });

  it("rejects a three-segment room name with 1008", async () => {
    const port = await start({ authorizeRoom: () => "editor" });
    const ws = await openPath(port, "/tenant/board/extra");
    let code = null;
    ws.addEventListener("close", (e) => {
      code = e.code;
    });
    await sleep(200);
    expect(code).toBe(1008);
  });

  it("drops unknown/CONTROL tags but still relays presence (tag allow-list)", async () => {
    const port = await start({ authorizeRoom: () => "editor" });
    const a = await open(port);
    const b = await open(port);
    const tagsAtB = [];
    b.addEventListener("message", (e) => {
      const by = new Uint8Array(e.data);
      if (by.byteLength > 0) tagsAtB.push(by[0]);
    });
    await sleep(120);
    a.send(frame(99, new Uint8Array([1, 2, 3]))); // unknown tag → dropped
    a.send(frame(2, new Uint8Array([1]))); // CONTROL inbound → dropped (never relayed)
    a.send(frame(AWARE, new Uint8Array([9, 9]))); // presence → relayed
    await sleep(150);
    expect(tagsAtB).toContain(AWARE);
    expect(tagsAtB).not.toContain(99);
  });

  it("enforces a per-socket rate limit, closing 1008 on breach", async () => {
    // A tiny budget: one frame/sec, plenty of bytes. The second frame in the window breaches.
    const port = await start({
      authorizeRoom: () => "editor",
      rateLimit: { framesPerSec: 1, bytesPerSec: 10 * 1024 * 1024 },
    });
    const ws = await open(port);
    let code = null;
    ws.addEventListener("close", (e) => {
      code = e.code;
    });
    await sleep(120);
    for (let i = 0; i < 5; i += 1) ws.send(frame(AWARE, new Uint8Array([i])));
    await sleep(200);
    expect(code).toBe(1008);
  });

  it("enforces a per-socket byte rate limit, closing 1008 on breach", async () => {
    const port = await start({
      authorizeRoom: () => "editor",
      rateLimit: { framesPerSec: 1000, bytesPerSec: 16 }, // generous frames, tiny byte budget
    });
    const ws = await open(port);
    let code = null;
    ws.addEventListener("close", (e) => {
      code = e.code;
    });
    await sleep(120);
    ws.send(frame(AWARE, new Uint8Array(64))); // 65 bytes > 16-byte budget → breach
    await sleep(200);
    expect(code).toBe(1008);
  });
});
