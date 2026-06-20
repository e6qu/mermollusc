import { brand, point } from "@m/std";
import type { SceneNodeId } from "@m/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectTransport,
  connectWebSocket,
  createCollabSession,
  type CollabSocket,
  webSocketTransport,
} from "../../src/index.js";

const n = (s: string): SceneNodeId => brand<string, "SceneNodeId">(s);

const blank = (source = "") =>
  createCollabSession({
    initialOverrides: new Map(),
    initialGroups: new Map(),
    initialSource: source,
    save: () => {},
  });

// Two in-memory `CollabSocket`s wired to each other. They start *closed* so both ends can register
// their message listeners before `connect()` flips them open (mirroring a real socket, whose `open`
// fires only once both ends exist) — otherwise the first state frame would arrive before the peer was
// listening and be lost.
const pair = (): { a: CollabSocket; b: CollabSocket; connect: () => void } => {
  const reg = {
    a: { msg: [] as Array<(d: Uint8Array) => void>, open: [] as Array<() => void> },
    b: { msg: [] as Array<(d: Uint8Array) => void>, open: [] as Array<() => void> },
  };
  let openA = false;
  let openB = false;
  const a: CollabSocket = {
    isOpen: () => openA,
    send: (d) => {
      for (const l of reg.b.msg) l(d);
    },
    onOpen: (l) => reg.a.open.push(l),
    onMessage: (l) => reg.a.msg.push(l),
    close: () => {
      openA = false;
    },
  };
  const b: CollabSocket = {
    isOpen: () => openB,
    send: (d) => {
      for (const l of reg.a.msg) l(d);
    },
    onOpen: (l) => reg.b.open.push(l),
    onMessage: (l) => reg.b.msg.push(l),
    close: () => {
      openB = false;
    },
  };
  const connect = () => {
    openA = true;
    openB = true;
    for (const l of reg.a.open) l();
    for (const l of reg.b.open) l();
  };
  return { a, b, connect };
};

describe("collab transport — connectTransport", () => {
  it("syncs the seeded state to a peer on open", () => {
    const a = blank("flowchart TD\n  A --> B\n");
    a.overlay.moveNode(n("A"), point(11, 22));
    const b = blank();
    const wire = pair();
    connectTransport(a, wire.a);
    connectTransport(b, wire.b);
    wire.connect();
    expect(b.source()).toBe("flowchart TD\n  A --> B\n");
    expect(b.overlay.overrides().get(n("A"))?.position).toEqual(point(11, 22));
    a.destroy();
    b.destroy();
  });

  it("forwards a local overlay edit live to the peer", () => {
    const a = blank();
    const b = blank();
    const wire = pair();
    connectTransport(a, wire.a);
    connectTransport(b, wire.b);
    wire.connect();
    a.overlay.moveNode(n("A"), point(5, 5));
    expect(b.overlay.overrides().get(n("A"))?.position).toEqual(point(5, 5));
    // and the other way
    b.overlay.moveNode(n("B"), point(6, 6));
    expect(a.overlay.overrides().get(n("B"))?.position).toEqual(point(6, 6));
    a.destroy();
    b.destroy();
  });

  it("a peer's overlay change fires onOverlayChange", () => {
    const a = blank();
    const b = blank();
    const wire = pair();
    connectTransport(a, wire.a);
    connectTransport(b, wire.b);
    wire.connect();
    let fired = 0;
    b.onOverlayChange(() => {
      fired += 1;
    });
    a.overlay.moveNode(n("A"), point(1, 1));
    expect(fired).toBeGreaterThan(0);
    a.destroy();
    b.destroy();
  });

  it("disconnect stops forwarding further edits", () => {
    const a = blank();
    const b = blank();
    const wire = pair();
    const cutA = connectTransport(a, wire.a);
    connectTransport(b, wire.b);
    wire.connect();
    cutA();
    a.overlay.moveNode(n("A"), point(9, 9));
    expect(b.overlay.overrides().has(n("A"))).toBe(false);
    a.destroy();
    b.destroy();
  });
});

// A stand-in for the platform WebSocket so `webSocketTransport` can be exercised without a server (the
// real socket path is covered end-to-end by the Playwright two-tab spec). A secure `wss://` URL keeps
// the transport contract honest — production never opens an insecure socket.
class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  binaryType = "";
  readonly sent: ArrayBuffer[] = [];
  private readonly listeners: { open: Array<() => void>; message: Array<(e: { data: unknown }) => void> } = {
    open: [],
    message: [],
  };
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: "open" | "message", cb: () => void): void {
    if (type === "open") this.listeners.open.push(cb);
    else this.listeners.message.push(cb as (e: { data: unknown }) => void);
  }
  send(data: ArrayBuffer): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    for (const l of this.listeners.open) l();
  }
  receive(bytes: Uint8Array): void {
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    for (const l of this.listeners.message) l({ data: buf });
  }
  receiveRaw(data: unknown): void {
    for (const l of this.listeners.message) l({ data });
  }
}

describe("collab transport — webSocketTransport (platform socket)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it("sends as a copied ArrayBuffer and decodes inbound frames to Uint8Array", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = webSocketTransport("wss://relay.example/room-1");
    const ws = FakeWebSocket.instances[0];
    if (ws === undefined) throw new Error("no socket created");
    expect(ws.url).toBe("wss://relay.example/room-1");
    expect(ws.binaryType).toBe("arraybuffer");
    expect(socket.isOpen()).toBe(true);

    socket.send(new Uint8Array([1, 2, 3]));
    expect(ws.sent).toHaveLength(1);
    expect([...new Uint8Array(ws.sent[0] ?? new ArrayBuffer(0))]).toEqual([1, 2, 3]);

    const received: number[][] = [];
    socket.onMessage((d) => received.push([...d]));
    ws.receive(new Uint8Array([9, 8]));
    expect(received).toEqual([[9, 8]]);

    socket.close();
    expect(ws.readyState).toBe(3);
    expect(socket.isOpen()).toBe(false);
  });

  it("ignores non-binary frames and fires onOpen on the open event", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = webSocketTransport("wss://relay.example/room-2");
    const ws = FakeWebSocket.instances[0];
    if (ws === undefined) throw new Error("no socket created");

    let opened = 0;
    socket.onOpen(() => {
      opened += 1;
    });
    ws.open();
    expect(opened).toBe(1);

    const received: number[][] = [];
    socket.onMessage((d) => received.push([...d]));
    ws.receiveRaw("not binary"); // a text frame must be ignored
    expect(received).toEqual([]);
  });

  it("connectWebSocket opens a socket and sends the session state on connect", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const session = blank("flowchart TD\n  A --> B\n");
    const cut = connectWebSocket(session, "wss://relay.example/room-3");
    const ws = FakeWebSocket.instances[0];
    if (ws === undefined) throw new Error("no socket created");
    expect(ws.sent.length).toBeGreaterThan(0); // the open-state frame was sent
    cut();
    expect(ws.readyState).toBe(3); // disconnect closed the socket
    session.destroy();
  });
});
