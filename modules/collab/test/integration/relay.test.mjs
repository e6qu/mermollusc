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

const servers = [];
const sockets = [];
const start = (opts) => {
  const wss = startRelay(opts);
  servers.push(wss);
  return new Promise((res) => wss.on("listening", () => res(wss.address().port)));
};
const open = (port) =>
  new Promise((res) => {
    const ws = new WebSocket(`${WS}://localhost:${port}/board`);
    ws.binaryType = "arraybuffer";
    sockets.push(ws);
    ws.addEventListener("open", () => res(ws));
  });

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
