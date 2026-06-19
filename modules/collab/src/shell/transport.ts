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
  close(): void;
}

// Bind a session to a socket: on open, send our whole state so the peer/relay can merge us in; apply
// every inbound update; forward our own local updates outbound. Returns a disconnect fn that stops
// forwarding and closes the socket. Applied remote updates are not re-forwarded (the session's
// `onUpdate` only emits local-origin updates), so a relay can't loop.
export const connectTransport = (session: CollabSession, socket: CollabSocket): (() => void) => {
  const sendState = (): void => socket.send(session.state());
  if (socket.isOpen()) sendState();
  else socket.onOpen(sendState);
  socket.onMessage((data) => session.applyUpdate(data));
  const off = session.onUpdate((update) => {
    if (socket.isOpen()) socket.send(update);
  });
  return () => {
    off();
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
    close: () => ws.close(),
  };
};

// Convenience: open a WebSocket to `url` and bind `session` to it. Returns the disconnect fn.
export const connectWebSocket = (session: CollabSession, url: string): (() => void) =>
  connectTransport(session, webSocketTransport(url));
