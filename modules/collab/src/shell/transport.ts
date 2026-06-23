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

// The reconnect lifecycle the app can surface. `reconnecting` = the inner socket dropped and we're
// backing off to retry; `reconnected` = a fresh socket opened and state was re-exchanged; `disconnected`
// = the backoff cap was exhausted, we've given up (this is when the consumer `onClose` fires).
export type ReconnectStatus = "reconnecting" | "reconnected" | "disconnected";

// Injected impurities + tuning for `reconnectingWebSocketTransport`, so the backoff schedule is fully
// deterministic under test. `now`/`schedule`/`random` replace `Date.now`/`setTimeout`/`Math.random`;
// `mkSocket` mints the inner socket (defaults to `webSocketTransport`, overridable for tests). The
// backoff is `min(baseMs * 2^attempt, capMs)` plus up to `jitter` × that of random jitter; after
// `maxRetries` consecutive failed attempts we declare `disconnected`.
export interface ReconnectDeps {
  readonly mkSocket?: (url: string) => CollabSocket;
  readonly schedule?: (run: () => void, delayMs: number) => void;
  readonly random?: () => number;
  readonly baseMs?: number;
  readonly capMs?: number;
  readonly jitter?: number;
  readonly maxRetries?: number;
  readonly onStatus?: (status: ReconnectStatus) => void;
}

// The exponential-backoff-with-jitter delay for retry `attempt` (0-based). Exposed so a test can assert
// the schedule directly without driving the socket lifecycle.
export const backoffDelay = (
  attempt: number,
  base: number,
  cap: number,
  jitter: number,
  random: () => number,
): number => {
  const exp = Math.min(cap, base * 2 ** attempt);
  return Math.round(exp + exp * jitter * random());
};

// A self-healing `CollabSocket`: when the underlying WebSocket drops, it MINTS A FRESH inner socket and
// re-registers every listener (a dead socket's listeners never fire again), retrying with exponential
// backoff + jitter up to a cap. On each successful reopen it re-fires the consumer's `onOpen`, so
// `connectTransport`'s state exchange re-runs and the peers re-sync (Yjs merges idempotently). The
// consumer's `onClose` fires only once the retry budget is exhausted — a transient drop is healed
// silently, a permanent one is surfaced. A `ReconnectStatus` is reported throughout for the UI.
export const reconnectingWebSocketTransport = (
  url: string,
  deps: ReconnectDeps = {},
): CollabSocket => {
  const mkSocket = deps.mkSocket ?? webSocketTransport;
  const schedule = deps.schedule ?? ((run, delayMs) => void setTimeout(run, delayMs));
  const random = deps.random ?? Math.random;
  const base = deps.baseMs ?? 500;
  const cap = deps.capMs ?? 30_000;
  const jitter = deps.jitter ?? 0.5;
  const maxRetries = deps.maxRetries ?? 8;

  // Consumer listeners are registered ONCE (by connectTransport) and must survive every inner-socket
  // swap, so we hold them here and re-bind each fresh socket to them.
  const openListeners: Array<() => void> = [];
  const messageListeners: Array<(data: Uint8Array) => void> = [];
  const closeListeners: Array<() => void> = [];

  let inner: CollabSocket = mkSocket(url);
  let attempt = 0;
  let closedByUser = false;
  let reconnectedPending = false;

  const report = (s: ReconnectStatus): void => deps.onStatus?.(s);

  // Wire a fresh inner socket to the held consumer listeners. On its open we reset the retry counter and
  // re-fire the consumer `onOpen` (state re-exchange). On its close we schedule a reconnect — never the
  // consumer `onClose`, which fires only when the budget is exhausted.
  const bind = (socket: CollabSocket): void => {
    socket.onOpen(() => {
      attempt = 0;
      if (reconnectedPending) {
        reconnectedPending = false;
        report("reconnected");
      }
      for (const l of openListeners) l();
    });
    socket.onMessage((data) => {
      for (const l of messageListeners) l(data);
    });
    socket.onClose(() => {
      if (closedByUser) return;
      reconnect();
    });
  };

  const reconnect = (): void => {
    if (closedByUser) return;
    if (attempt >= maxRetries) {
      report("disconnected");
      for (const l of closeListeners) l(); // budget exhausted → surface the drop to the consumer
      return;
    }
    const delay = backoffDelay(attempt, base, cap, jitter, random);
    attempt += 1;
    reconnectedPending = true;
    report("reconnecting");
    schedule(() => {
      if (closedByUser) return;
      inner = mkSocket(url); // a fresh socket — the old one's listeners are dead
      bind(inner);
    }, delay);
  };

  bind(inner);

  return {
    isOpen: () => inner.isOpen(),
    send: (data) => inner.send(data),
    onOpen: (listener) => {
      openListeners.push(listener);
      // If the current inner socket is already open (the initial socket connected synchronously, as the
      // FakeWebSocket in tests does), fire immediately so the first state exchange still runs.
      if (inner.isOpen()) listener();
    },
    onMessage: (listener) => messageListeners.push(listener),
    onClose: (listener) => closeListeners.push(listener),
    close: () => {
      closedByUser = true;
      inner.close();
    },
  };
};
