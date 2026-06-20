import type { CollabSession } from "./session.js";

// The transport seam between a `CollabSession` and a peer/relay. The session speaks only binary Yjs
// updates (`state`/`applyUpdate`/`onUpdate`); a `CollabSocket` is any duplex carrier for those bytes,
// so the wiring (`connectTransport`) is identical whether the carrier is a real WebSocket, an in-memory
// pair (tests), or a future provider. Keeping it an interface keeps Yjs out of the transport contract.
export interface CollabSocket {
  isOpen(): boolean;
  send(data: Uint8Array): void;
  onOpen(listener: () => void): void;
  onMessage(listener: (data: Uint8Array) => void): void;
  onClose(listener: () => void): void;
  close(): void;
}

// Frame tags: the document (CRDT) and presence (awareness) travel on the same socket as distinct
// frames, a single leading byte apart. CONTROL is a server→client channel (e.g. the granted role). The
// relay keeps the document, only relays presence, and originates control.
const DOC = 0;
const AWARE = 1;
const CONTROL = 2;

const framed = (tag: number, payload: Uint8Array): Uint8Array => {
  const frame = new Uint8Array(payload.byteLength + 1);
  frame[0] = tag;
  frame.set(payload, 1);
  return frame;
};

// Optional hooks. `onControl` receives a server control message (a short UTF-8 string, e.g. the role);
// `onClose` fires when the underlying socket drops or errors (so a disconnect is surfaced, not silent).
export interface TransportHooks {
  onControl?: (message: string) => void;
  onClose?: () => void;
}

// Bind a session to a socket: on open, send our whole document + presence so the peer/relay can merge
// us in; apply every inbound frame to the matching channel; forward our own local updates outbound.
// Returns a disconnect fn that stops forwarding and closes the socket. Applied remote updates are not
// re-forwarded (the session emits only local-origin updates), so a relay can't loop.
export const connectTransport = (
  session: CollabSession,
  socket: CollabSocket,
  hooks: TransportHooks = {},
): (() => void) => {
  const sendState = (): void => {
    socket.send(framed(DOC, session.state()));
    socket.send(framed(AWARE, session.awarenessState()));
  };
  if (socket.isOpen()) sendState();
  else socket.onOpen(sendState);
  socket.onMessage((data) => {
    if (data.byteLength === 0) return;
    const payload = data.subarray(1);
    if (data[0] === DOC) session.applyUpdate(payload);
    else if (data[0] === AWARE) session.applyAwarenessUpdate(payload);
    else if (data[0] === CONTROL) hooks.onControl?.(new TextDecoder().decode(payload));
  });
  if (hooks.onClose !== undefined) socket.onClose(hooks.onClose);
  const offDoc = session.onUpdate((update) => {
    if (socket.isOpen()) socket.send(framed(DOC, update));
  });
  const offAware = session.onAwarenessUpdate((update) => {
    if (socket.isOpen()) socket.send(framed(AWARE, update));
  });
  return () => {
    offDoc();
    offAware();
    socket.close();
  };
};

// A `CollabSocket` over the platform `WebSocket` (browser, or Node ≥22 where it is a global). Binary
// frames carry Yjs updates. The caller owns the room: encode it in `url` (the relay rooms by path).
export const webSocketTransport = (url: string): CollabSocket => {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  return {
    isOpen: () => ws.readyState === WebSocket.OPEN,
    // Copy into a plain ArrayBuffer so the platform `send` (which rejects a `SharedArrayBuffer`-backed
    // view) always gets a concrete binary frame; updates are small, so the copy is negligible.
    send: (data) => {
      const buf = new ArrayBuffer(data.byteLength);
      new Uint8Array(buf).set(data);
      ws.send(buf);
    },
    onOpen: (listener) => ws.addEventListener("open", () => listener()),
    onMessage: (listener) =>
      ws.addEventListener("message", (e) => {
        const data: unknown = e.data;
        if (data instanceof ArrayBuffer) listener(new Uint8Array(data));
      }),
    onClose: (listener) => {
      // A relay drop surfaces as `close`; a failed connection as `error` (which is also followed by
      // `close` in browsers, but Node's WebSocket may only emit `error`) — fire the listener once.
      let fired = false;
      const once = (): void => {
        if (fired) return;
        fired = true;
        listener();
      };
      ws.addEventListener("close", once);
      ws.addEventListener("error", once);
    },
    close: () => ws.close(),
  };
};

// Convenience: open a WebSocket to `url` and bind `session` to it. Returns the disconnect fn.
export const connectWebSocket = (
  session: CollabSession,
  url: string,
  hooks: TransportHooks = {},
): (() => void) => connectTransport(session, webSocketTransport(url), hooks);
