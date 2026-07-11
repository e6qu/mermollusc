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
import type { CollabSocket, SocketCloseEvent } from "./transport.js";

// The four functions modules/relay/cmd/relay-wasm/main.go registers on the global object. `onClosed`
// fires exactly once when the relay itself closes the connection (a rejection, a policy close) — without
// it a rejected client would believe it is still connected.
export interface WasmRelayGlobal {
  readonly mermolluscRelayConnect: (
    room: string,
    onSend: (bytes: Uint8Array) => void,
    onLoad: (room: string) => Promise<Uint8Array | null>,
    onSave: (room: string, snapshot: Uint8Array) => Promise<void>,
    onClosed: (code: number, reason: string) => void,
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

// Every live wasm-relay socket registers here so a Go runtime crash (or exit) can close them all —
// otherwise a crashed relay leaves every connection believing it is still connected.
const runtimeFailureListeners = new Set<(event: SocketCloseEvent) => void>();

const failRuntime = (reason: string): void => {
  // The runtime is dead: drop the cached module so a later `loadWasmRelay` can re-instantiate instead
  // of handing out a corpse, and surface the close to every live connection.
  loaded = null;
  const listeners = [...runtimeFailureListeners];
  runtimeFailureListeners.clear();
  for (const listener of listeners) listener({ code: null, reason });
};

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

// Injects wasm_exec.js and instantiates relay.wasm. Idempotent while healthy (only the first call does
// any work); a load failure or a later Go runtime death evicts the cached promise so the next call
// retries instead of re-throwing a stale rejection forever. Lazy by convention: call this only once
// backend-free `?collab` is actually in use, never eagerly — the compiled module is real weight
// (~1.4MB gzipped, measured on the real cmd/relay-wasm build).
export const loadWasmRelay = (
  relayWasmURL = "/relay.wasm",
  wasmExecURL = "/wasm_exec.js",
): Promise<WasmRelayGlobal> => {
  if (loaded !== null) return loaded;
  const loading = (async () => {
    await injectScript(wasmExecURL);
    const Go = (window as unknown as { Go: GoConstructor }).Go;
    const go = new Go();
    const instance = await instantiateWasm(relayWasmURL, go.importObject);
    // go.run(instance)'s promise resolves only when the Go program's main() returns; main() blocks in
    // `select {}` forever by design, so neither branch should ever run — both mean the relay runtime is
    // DEAD, which must reach every live connection loudly, never be swallowed.
    go.run(instance).then(
      () => {
        console.error("wasm relay: Go runtime exited — the in-process relay is gone");
        failRuntime("wasm relay runtime exited");
      },
      (e: unknown) => {
        console.error("wasm relay: Go runtime crashed:", e);
        failRuntime("wasm relay runtime crashed");
      },
    );
    return readyGlobal(10_000);
  })();
  loaded = loading;
  loading.catch(() => {
    // Don't cache the rejection: the next visit retries the whole load. Callers still see the original
    // rejection from their own await — this is cache eviction, not error suppression.
    if (loaded === loading) loaded = null;
  });
  return loading;
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
  const closeListeners: Array<(event: SocketCloseEvent) => void> = [];
  let open = true;
  let closeSurfaced = false;

  // Fires the consumer's close listeners exactly once, whichever side closed first (the client via
  // close(), the relay via onClosed, or a runtime crash).
  const surfaceClose = (event: SocketCloseEvent): void => {
    if (closeSurfaced) return;
    closeSurfaced = true;
    open = false;
    runtimeFailureListeners.delete(surfaceClose);
    for (const listener of closeListeners) listener(event);
  };
  runtimeFailureListeners.add(surfaceClose);

  const handle = relay.mermolluscRelayConnect(
    opts.room,
    (bytes) => {
      for (const listener of messageListeners) listener(bytes);
    },
    (room) => opts.store.load(room),
    (room, snapshot) => opts.store.save(room, snapshot),
    (code, reason) => {
      // A relay-driven close the client didn't ask for is a rejection — loud, never silent.
      if (!closeSurfaced) {
        console.error(`wasm relay: connection closed by the relay (${code}): ${reason}`);
      }
      surfaceClose({ code, reason });
    },
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
      surfaceClose({ code: 1000, reason: "client close" });
    },
  };

  return { socket, flushAll: () => relay.mermolluscRelayFlush() };
};
