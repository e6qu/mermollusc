import { brand, point } from "@m/std";
import type { SceneNodeId } from "@m/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectTransport,
  connectWebSocket,
  createCollabSession,
  type CollabSocket,
  type ReconnectStatus,
  reconnectingWebSocketTransport,
  webSocketTransport,
} from "../../src/index.js";
import { backoffDelay } from "../../src/shell/transport.js";

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
    onClose: () => {},
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
    onClose: () => {},
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

  it("setLocalUser emits an awareness frame a peer can apply", () => {
    const a = blank();
    let frame: Uint8Array | null = null;
    a.onAwarenessUpdate((u) => {
      frame = u;
    });
    a.setLocalUser({ name: "Ada", color: "#ff0000" });
    if (frame === null) throw new Error("no awareness frame emitted");
    expect((frame as Uint8Array).byteLength).toBeGreaterThan(0);
    expect(a.awarenessState().byteLength).toBeGreaterThan(0);
    const b = blank();
    expect(() => b.applyAwarenessUpdate(frame as Uint8Array)).not.toThrow();
    a.destroy();
    b.destroy();
  });

  it("routes both document and presence frames between connected peers", () => {
    const a = blank();
    const b = blank();
    const wire = pair();
    connectTransport(a, wire.a);
    connectTransport(b, wire.b);
    const tagsAtB: number[] = [];
    wire.b.onMessage((d) => tagsAtB.push(d[0] ?? -1));
    wire.connect(); // open → peers exchange a document frame (0) and a presence frame (1)
    a.setLocalUser({ name: "Ada", color: "#ff0000" });
    expect(tagsAtB).toContain(0);
    expect(tagsAtB).toContain(1);

    // malformed frames are ignored, not fatal: an empty frame and an unknown tag both no-op
    expect(() => {
      wire.a.send(new Uint8Array(0));
      wire.a.send(new Uint8Array([2, 9]));
    }).not.toThrow();
    a.destroy();
    b.destroy();
  });

  it("routes a server control frame to onControl", () => {
    const a = blank();
    const wire = pair();
    let control = "";
    connectTransport(a, wire.a, {
      onControl: (m) => {
        control = m;
      },
    });
    wire.connect();
    // the "server" (the other end) sends a control frame (tag 2) carrying the role
    const payload = new TextEncoder().encode("viewer");
    const frame = new Uint8Array(payload.byteLength + 1);
    frame[0] = 2;
    frame.set(payload, 1);
    wire.b.send(frame);
    expect(control).toBe("viewer");
    a.destroy();
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
  private readonly listeners: {
    open: Array<() => void>;
    message: Array<(e: { data: unknown }) => void>;
    close: Array<() => void>;
    error: Array<() => void>;
  } = { open: [], message: [], close: [], error: [] };
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: "open" | "message" | "close" | "error", cb: () => void): void {
    if (type === "open") this.listeners.open.push(cb);
    else if (type === "close") this.listeners.close.push(cb);
    else if (type === "error") this.listeners.error.push(cb);
    else this.listeners.message.push(cb as (e: { data: unknown }) => void);
  }
  send(data: ArrayBuffer): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    for (const l of this.listeners.close) l();
  }
  error(): void {
    for (const l of this.listeners.error) l();
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

  it("onClose fires once on a drop, whether close or error (or both) arrive", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const session = blank();
    let drops = 0;
    connectWebSocket(session, "wss://relay.example/room-4", {
      onClose: () => {
        drops += 1;
      },
    });
    const ws = FakeWebSocket.instances[0];
    if (ws === undefined) throw new Error("no socket created");
    ws.error(); // a failed connection emits error…
    ws.close(); // …then close — the listener must fire exactly once
    expect(drops).toBe(1);
    session.destroy();
  });
});

// A controllable in-memory `CollabSocket` so the reconnecting transport's lifecycle (open → drop →
// re-mint → reopen) is driven deterministically, no platform WebSocket involved. Each instance starts
// closed; `flipOpen()` fires its `onOpen`, `drop()` its `onClose`.
class ControlSocket {
  static minted: ControlSocket[] = [];
  open = false;
  readonly sent: Uint8Array[] = [];
  private readonly openCbs: Array<() => void> = [];
  private readonly msgCbs: Array<(d: Uint8Array) => void> = [];
  private readonly closeCbs: Array<() => void> = [];
  constructor(readonly url: string) {
    ControlSocket.minted.push(this);
  }
  isOpen(): boolean {
    return this.open;
  }
  send(data: Uint8Array): void {
    this.sent.push(data);
  }
  onOpen(l: () => void): void {
    this.openCbs.push(l);
  }
  onMessage(l: (d: Uint8Array) => void): void {
    this.msgCbs.push(l);
  }
  onClose(l: () => void): void {
    this.closeCbs.push(l);
  }
  close(): void {
    this.open = false;
  }
  flipOpen(): void {
    this.open = true;
    for (const l of this.openCbs) l();
  }
  drop(): void {
    this.open = false;
    for (const l of this.closeCbs) l();
  }
  deliver(d: Uint8Array): void {
    for (const l of this.msgCbs) l(d);
  }
}

describe("collab transport — backoff schedule", () => {
  it("is exponential up to the cap, with deterministic jitter from the injected random", () => {
    // random() = 0 → no jitter, so the bare exponential shows through, capped.
    const zero = () => 0;
    expect(backoffDelay(0, 500, 30_000, 0.5, zero)).toBe(500);
    expect(backoffDelay(1, 500, 30_000, 0.5, zero)).toBe(1000);
    expect(backoffDelay(2, 500, 30_000, 0.5, zero)).toBe(2000);
    expect(backoffDelay(10, 500, 30_000, 0.5, zero)).toBe(30_000); // 500·2^10 = 512000 → capped

    // random() = 1 → full jitter: each delay grows by jitter× its exponential.
    const one = () => 1;
    expect(backoffDelay(0, 500, 30_000, 0.5, one)).toBe(750); // 500 + 500·0.5·1
    expect(backoffDelay(1, 500, 30_000, 0.5, one)).toBe(1500); // 1000 + 1000·0.5
    expect(backoffDelay(10, 500, 30_000, 0.5, one)).toBe(45_000); // 30000 + 30000·0.5
  });
});

describe("collab transport — reconnectingWebSocketTransport", () => {
  afterEach(() => {
    ControlSocket.minted = [];
  });

  it("re-mints a fresh socket on drop and re-fires onOpen so state re-exchanges", () => {
    const scheduled: Array<{ run: () => void; delay: number }> = [];
    const statuses: ReconnectStatus[] = [];
    const socket = reconnectingWebSocketTransport("wss://relay/room", {
      mkSocket: (u) => new ControlSocket(u),
      schedule: (run, delay) => scheduled.push({ run, delay }),
      random: () => 0,
      onStatus: (s) => statuses.push(s),
    });

    // The consumer (a stand-in for connectTransport) registers its listeners once and counts opens.
    let opens = 0;
    socket.onOpen(() => {
      opens += 1;
    });
    const received: number[] = [];
    socket.onMessage((d) => received.push(d[0] ?? -1));

    const first = ControlSocket.minted[0];
    if (first === undefined) throw new Error("no socket minted");
    first.flipOpen();
    expect(opens).toBe(1); // initial open re-runs the consumer's state exchange

    // The relay drops the socket. The transport must NOT call the consumer onClose yet; it schedules a
    // reconnect and reports "reconnecting".
    let closedToConsumer = 0;
    socket.onClose(() => {
      closedToConsumer += 1;
    });
    first.drop();
    expect(statuses).toContain("reconnecting");
    expect(closedToConsumer).toBe(0);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delay).toBe(500); // first backoff

    // Run the scheduled reconnect → a FRESH socket is minted; the dead first socket's listeners are
    // gone. The new socket opening re-fires the consumer onOpen (state re-exchange) and reports
    // "reconnected".
    scheduled[0]?.run();
    const second = ControlSocket.minted[1];
    if (second === undefined) throw new Error("no reconnect socket minted");
    expect(second).not.toBe(first);
    second.flipOpen();
    expect(opens).toBe(2); // the re-open re-runs the consumer's state exchange (Yjs merges idempotently)
    expect(statuses).toContain("reconnected");

    // Messages now flow through the fresh socket to the same consumer listener.
    second.deliver(new Uint8Array([7, 1, 2]));
    expect(received).toContain(7);

    socket.close();
  });

  it("fires the consumer onClose only after the retry budget is exhausted", () => {
    const scheduled: Array<() => void> = [];
    const statuses: ReconnectStatus[] = [];
    const socket = reconnectingWebSocketTransport("wss://relay/room", {
      mkSocket: (u) => new ControlSocket(u),
      schedule: (run) => scheduled.push(run),
      random: () => 0,
      maxRetries: 2,
      onStatus: (s) => statuses.push(s),
    });
    let closedToConsumer = 0;
    socket.onClose(() => {
      closedToConsumer += 1;
    });

    const first = ControlSocket.minted[0];
    if (first === undefined) throw new Error("no socket minted");
    first.flipOpen();

    // Drop, retry, drop again, retry again, drop a third time → budget (2) exhausted → disconnected.
    first.drop(); // attempt 0 scheduled
    expect(closedToConsumer).toBe(0);
    scheduled[0]?.();
    ControlSocket.minted[1]?.drop(); // attempt 1 scheduled
    expect(closedToConsumer).toBe(0);
    scheduled[1]?.();
    ControlSocket.minted[2]?.drop(); // budget exhausted
    expect(statuses).toContain("disconnected");
    expect(closedToConsumer).toBe(1);

    socket.close();
  });

  it("a user-initiated close stops reconnecting", () => {
    const scheduled: Array<() => void> = [];
    const socket = reconnectingWebSocketTransport("wss://relay/room", {
      mkSocket: (u) => new ControlSocket(u),
      schedule: (run) => scheduled.push(run),
      random: () => 0,
    });
    const first = ControlSocket.minted[0];
    if (first === undefined) throw new Error("no socket minted");
    first.flipOpen();
    socket.close();
    first.drop(); // a close after the user left must not schedule a reconnect
    expect(scheduled).toHaveLength(0);
  });

  it("proxies isOpen/send to the inner socket and defaults its deps to the platform socket", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    // No deps injected → mkSocket defaults to webSocketTransport, schedule to setTimeout, random to
    // Math.random. The FakeWebSocket starts OPEN, so isOpen proxies true and send reaches it.
    const socket = reconnectingWebSocketTransport("wss://relay.example/room-r");
    const ws = FakeWebSocket.instances[0];
    if (ws === undefined) throw new Error("no socket created");
    expect(socket.isOpen()).toBe(true);
    socket.send(new Uint8Array([4, 5, 6]));
    expect(ws.sent).toHaveLength(1);
    expect([...new Uint8Array(ws.sent[0] ?? new ArrayBuffer(0))]).toEqual([4, 5, 6]);
    socket.close();
    expect(ws.readyState).toBe(3);
  });
});
