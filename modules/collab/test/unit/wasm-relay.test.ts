// connectWasmRelay's wiring logic (CollabSocket <-> the WASM module's calling convention), tested
// against a fake WasmRelayGlobal — the actual loading mechanics (script injection, fetch, WebAssembly
// instantiation) are real browser API orchestration with no meaningful Node-side unit test, covered by
// this repo's Playwright e2e suite instead. The Go side of this same boundary has its own test suite
// under modules/relay/cmd/relay-wasm, driven through real js.Value/Promise semantics via go_js_wasm_exec.

import { describe, expect, it, vi } from "vitest";
import type { WasmRelayGlobal } from "../../src/index.js";
import { connectWasmRelay } from "../../src/index.js";

const fakeRelay = (): {
  relay: WasmRelayGlobal;
  send: (bytes: Uint8Array) => void;
  closeFromRelay: (code: number, reason: string) => void;
  received: Array<{ handle: number; bytes: Uint8Array }>;
  closed: number[];
  flushed: number;
} => {
  let onSend: ((bytes: Uint8Array) => void) | null = null;
  let onClosed: ((code: number, reason: string) => void) | null = null;
  const received: Array<{ handle: number; bytes: Uint8Array }> = [];
  const closed: number[] = [];
  let flushed = 0;
  const relay: WasmRelayGlobal = {
    mermolluscRelayConnect: (_room, send, _onLoad, _onSave, closedCb) => {
      onSend = send;
      onClosed = closedCb;
      return 42;
    },
    mermolluscRelayReceive: (handle, bytes) => {
      received.push({ handle, bytes });
    },
    mermolluscRelayClose: (handle) => {
      closed.push(handle);
    },
    mermolluscRelayFlush: () => {
      flushed += 1;
      return Promise.resolve();
    },
  };
  return {
    relay,
    send: (bytes) => onSend?.(bytes),
    closeFromRelay: (code, reason) => onClosed?.(code, reason),
    received,
    closed,
    get flushed() {
      return flushed;
    },
  };
};

const fakeStore = () => ({
  load: vi.fn(async (_room: string) => null),
  save: vi.fn(async (_room: string, _snapshot: Uint8Array) => {}),
});

describe("connectWasmRelay", () => {
  it("passes the room through to mermolluscRelayConnect", async () => {
    const { relay } = fakeRelay();
    const spy = vi.spyOn(relay, "mermolluscRelayConnect");
    await connectWasmRelay({ room: "tenant/board", store: fakeStore(), relay });
    expect(spy).toHaveBeenCalledWith(
      "tenant/board",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("a relay-driven close (a rejection) fires onClose listeners with the code and flips isOpen", async () => {
    const fake = fakeRelay();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { socket } = await connectWasmRelay({ room: "r", store: fakeStore(), relay: fake.relay });
    const closes: Array<{ code: number | null; reason: string }> = [];
    socket.onClose((e) => closes.push(e));

    fake.closeFromRelay(1008, "invalid room name");
    expect(closes).toEqual([{ code: 1008, reason: "invalid room name" }]);
    expect(socket.isOpen()).toBe(false);
    expect(errorSpy).toHaveBeenCalled(); // a rejection is loud, never silent

    // the Go side confirming the close afterwards must not re-fire the listeners
    fake.closeFromRelay(1008, "invalid room name");
    expect(closes).toHaveLength(1);
    errorSpy.mockRestore();
  });

  it("a client close followed by the relay's onClosed confirmation fires listeners exactly once", async () => {
    const fake = fakeRelay();
    const { socket } = await connectWasmRelay({ room: "r", store: fakeStore(), relay: fake.relay });
    let closes = 0;
    socket.onClose(() => {
      closes += 1;
    });
    socket.close();
    fake.closeFromRelay(1000, "client close"); // the Go side echoes the close back
    expect(closes).toBe(1);
    expect(fake.closed).toEqual([42]);
  });

  it("is open immediately and never fires onOpen (already open by construction)", async () => {
    const { relay } = fakeRelay();
    const { socket } = await connectWasmRelay({ room: "r", store: fakeStore(), relay });
    expect(socket.isOpen()).toBe(true);
    let fired = false;
    socket.onOpen(() => {
      fired = true;
    });
    expect(fired).toBe(false);
  });

  it("send() forwards bytes to mermolluscRelayReceive with the connection's handle", async () => {
    const fake = fakeRelay();
    const { socket } = await connectWasmRelay({ room: "r", store: fakeStore(), relay: fake.relay });
    const bytes = new Uint8Array([1, 2, 3]);
    socket.send(bytes);
    expect(fake.received).toEqual([{ handle: 42, bytes }]);
  });

  it("onSend from the Go side dispatches to every registered onMessage listener", async () => {
    const fake = fakeRelay();
    const { socket } = await connectWasmRelay({ room: "r", store: fakeStore(), relay: fake.relay });
    const gotA: Uint8Array[] = [];
    const gotB: Uint8Array[] = [];
    socket.onMessage((d) => gotA.push(d));
    socket.onMessage((d) => gotB.push(d));
    const frame = new Uint8Array([9, 9]);
    fake.send(frame);
    expect(gotA).toEqual([frame]);
    expect(gotB).toEqual([frame]);
  });

  it("close() calls mermolluscRelayClose, fires onClose listeners once, and is idempotent", async () => {
    const fake = fakeRelay();
    const { socket } = await connectWasmRelay({ room: "r", store: fakeStore(), relay: fake.relay });
    let closes = 0;
    socket.onClose(() => {
      closes += 1;
    });
    socket.close();
    socket.close(); // second call must be a no-op
    expect(fake.closed).toEqual([42]);
    expect(closes).toBe(1);
    expect(socket.isOpen()).toBe(false);
  });

  it("flushAll() calls mermolluscRelayFlush", async () => {
    const fake = fakeRelay();
    const { flushAll } = await connectWasmRelay({ room: "r", store: fakeStore(), relay: fake.relay });
    await flushAll();
    expect(fake.flushed).toBe(1);
  });

  it("wires the store through onLoad/onSave", async () => {
    const { relay } = fakeRelay();
    const connectSpy = vi.spyOn(relay, "mermolluscRelayConnect");
    const store = fakeStore();
    await connectWasmRelay({ room: "r", store, relay });

    const call = connectSpy.mock.calls[0];
    if (call === undefined) throw new Error("mermolluscRelayConnect was not called");
    const [, , onLoad, onSave] = call;

    await onLoad("r");
    expect(store.load).toHaveBeenCalledWith("r");

    const snapshot = new Uint8Array([1]);
    await onSave("r", snapshot);
    expect(store.save).toHaveBeenCalledWith("r", snapshot);
  });
});
