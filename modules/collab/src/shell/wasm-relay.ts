// Drives the SAME relay logic production runs — compiled to WebAssembly — in-process inside a browser
// tab, for the backend-free demo. See modules/relay/cmd/relay-wasm/main.go for the Go side of this seam;
// the wire contract (four global functions) is documented there.
//
// No bundler-plugin tooling: Go's WASM output isn't an ES module (unlike wasm-pack's Rust output) — it's
// a `.wasm` binary paired with `wasm_exec.js`, a plain script Go itself ships that defines a global `Go`
// class. Loaded via the standard fetch + WebAssembly.instantiateStreaming pattern.
//
// The loading mechanics (script injection, fetch, WebAssembly instantiation) are real browser API
// orchestration with no meaningful way to unit test in Node — covered by this repo's Playwright e2e
// suite instead. `connectWasmRelay`'s wiring logic (translating between `CollabSocket` and the WASM
// module's calling convention) is the part most likely to have bugs, so it accepts an injectable
// `WasmRelayGlobal` — real callers omit it (defaults to the real loaded module); tests supply a fake one.

import type { AsyncRoomStore } from "./store.js";
import type { CollabSocket } from "./transport.js";

// The four functions modules/relay/cmd/relay-wasm/main.go registers on the global object.
export interface WasmRelayGlobal {
  readonly mermolluscRelayConnect: (
    room: string,
    onSend: (bytes: Uint8Array) => void,
    onLoad: (room: string) => Promise<Uint8Array | null>,
    onSave: (room: string, snapshot: Uint8Array) => Promise<void>,
  ) => number;
  readonly mermolluscRelayReceive: (handle: number, bytes: Uint8Array) => void;
  readonly mermolluscRelayClose: (handle: number) => void;
  readonly mermolluscRelayFlush: () => Promise<void>;
}

interface GoConstructor {
  new (): {
    importObject: WebAssembly.Imports;
    run: (instance: WebAssembly.Instance) => Promise<void>;
  };
}

let loaded: Promise<WasmRelayGlobal> | null = null;

const readyGlobal = async (deadlineMs: number): Promise<WasmRelayGlobal> => {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const candidate = window as unknown as Partial<WasmRelayGlobal>;
    if (typeof candidate.mermolluscRelayConnect === "function") {
      return candidate as WasmRelayGlobal;
    }
    if (Date.now() > deadline) {
      throw new Error("wasm relay: timed out waiting for the module to initialise");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const injectScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`wasm relay: failed to load ${src}`));
    document.head.appendChild(script);
  });

// instantiateStreaming requires the server to send `Content-Type: application/wasm`; not every static
// file server gets that right (GitHub Pages does; a naive one might not). Fall back to the
// content-type-agnostic buffered path rather than failing the whole demo over a header.
const instantiateWasm = async (
  url: string,
  importObject: WebAssembly.Imports,
): Promise<WebAssembly.Instance> => {
  try {
    const result = await WebAssembly.instantiateStreaming(fetch(url), importObject);
    return result.instance;
  } catch (e) {
    // Log before retrying: if the wasm itself is corrupt (not just a content-type header), the retry
    // re-downloads and fails with a LESS specific error — the first one is the diagnostic that matters.
    console.error("wasm relay: instantiateStreaming failed, retrying buffered:", e);
    const bytes = await (await fetch(url)).arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, importObject);
    return result.instance;
  }
};

// Injects wasm_exec.js and instantiates relay.wasm. Idempotent (safe to call more than once — only the
// first call does any work) and lazy by convention: call this only once backend-free `?collab` is
// actually in use, never eagerly — the compiled module is real weight (~1.2MB gzipped).
export const loadWasmRelay = (
  relayWasmURL = "/relay.wasm",
  wasmExecURL = "/wasm_exec.js",
): Promise<WasmRelayGlobal> => {
  if (loaded !== null) return loaded;
  loaded = (async () => {
    await injectScript(wasmExecURL);
    const Go = (window as unknown as { Go: GoConstructor }).Go;
    const go = new Go();
    const instance = await instantiateWasm(relayWasmURL, go.importObject);
    // go.run(instance)'s promise only resolves when the Go program's main() returns; main() blocks in
    // `select {}` forever by design, so this never resolves — fire it, don't await it.
    void go.run(instance);
    return readyGlobal(10_000);
  })();
  return loaded;
};

export interface WasmRelayConnection {
  readonly socket: CollabSocket;
  flushAll(): Promise<void>;
}

// connectWasmRelay wires a CollabSocket up to the WASM relay core, backed by `store` for persistence
// (the real IndexedDB-backed RoomStore in production use — IndexedDB access stays in TypeScript, the Go
// side only ever sees load/save callbacks). Feed the returned socket into connectTransport exactly like
// a real WebSocket-backed one — the two paths differ only in which function produced the CollabSocket.
export const connectWasmRelay = async (opts: {
  readonly room: string;
  readonly store: AsyncRoomStore;
  readonly relay?: WasmRelayGlobal;
}): Promise<WasmRelayConnection> => {
  const relay = opts.relay ?? (await loadWasmRelay());

  const messageListeners: Array<(data: Uint8Array) => void> = [];
  const closeListeners: Array<() => void> = [];
  let open = true;

  const handle = relay.mermolluscRelayConnect(
    opts.room,
    (bytes) => {
      for (const listener of messageListeners) listener(bytes);
    },
    (room) => opts.store.load(room),
    (room, snapshot) => opts.store.save(room, snapshot),
  );

  const socket: CollabSocket = {
    isOpen: () => open,
    // Already open by the time connectWasmRelay resolves — connectTransport checks isOpen() first and
    // proceeds immediately without needing onOpen to fire, so this is a legitimate no-op, not a stub.
    onOpen: () => {},
    send: (data) => relay.mermolluscRelayReceive(handle, data),
    onMessage: (listener) => {
      messageListeners.push(listener);
    },
    onClose: (listener) => {
      closeListeners.push(listener);
    },
    close: () => {
      if (!open) return;
      open = false;
      relay.mermolluscRelayClose(handle);
      for (const listener of closeListeners) listener();
    },
  };

  return { socket, flushAll: () => relay.mermolluscRelayFlush() };
};
