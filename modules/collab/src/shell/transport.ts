import { type Logger, stamp } from "@m/std";
import type { CollabEvent, CollabSession } from "./session.js";

// The transport seam between a `CollabSession` and a peer/relay. The session speaks only binary Yjs
// updates (`state`/`applyUpdate`/`onUpdate`); a `CollabSocket` is any duplex carrier for those bytes,
// so the wiring (`connectTransport`) is identical whether the carrier is a real WebSocket, an in-memory
// pair (tests), or a future provider. Keeping it an interface keeps Yjs out of the transport contract.

// Why the close event carries a code: the relay closes with 1008 (policy violation — bad room, bad
// token, rate-limit breach) or the peer with 1009 (frame too big); those are PERMANENT rejections that
// must not be retried, unlike a transient network drop (`code: null` when no close code is known).
export interface SocketCloseEvent {
  readonly code: number | null;
  readonly reason: string;
}

// RFC 6455 close codes the relay uses as policy rejections — retrying them replays the same rejection.
const POLICY_CLOSE_CODES: ReadonlySet<number> = new Set([1008, 1009]);
export const isPolicyClose = (event: SocketCloseEvent): boolean =>
  event.code !== null && POLICY_CLOSE_CODES.has(event.code);

export interface CollabSocket {
  isOpen(): boolean;
  send(data: Uint8Array): void;
  onOpen(listener: () => void): void;
  onMessage(listener: (data: Uint8Array) => void): void;
  onClose(listener: (event: SocketCloseEvent) => void): void;
  close(): void;
}

// Frame tags: the document (CRDT) and presence (awareness) travel on the same socket as distinct
// frames, a single leading byte apart. CONTROL is a server→client channel (e.g. the granted role), and
// AUTH is the client→server token channel sent before document/presence frames when auth is enabled.
// The relay keeps the document, only relays presence, and originates control.
const DOC = 0;
const AWARE = 1;
const CONTROL = 2;
const AUTH = 3;

const framed = (tag: number, payload: Uint8Array): Uint8Array => {
  const frame = new Uint8Array(payload.byteLength + 1);
  frame[0] = tag;
  frame.set(payload, 1);
  return frame;
};

// The CONTROL channel's closed vocabulary — the relay's granted role, or the reserved "seed" grant (the
// relay's promise that THIS connection and no other may seed an empty room's initial content, see
// modules/relay: room.seeder). Anything else on the wire is decoded to `null` at this boundary, logged
// loudly, and dropped — a raw peer string never reaches the app (which renders the role into the DOM).
export type RelayRole = "owner" | "editor" | "viewer";
export type RelayControlMessage =
  | { readonly kind: "role"; readonly role: RelayRole }
  | { readonly kind: "seed" };

export const decodeControlMessage = (text: string): RelayControlMessage | null => {
  switch (text) {
    case "owner":
    case "editor":
    case "viewer":
      return { kind: "role", role: text };
    case "seed":
      return { kind: "seed" };
    default:
      return null;
  }
};

// Optional hooks. `authToken` sends an access token as the first client frame on every socket open;
// `onControl` receives a decoded server control message; `onClose` fires when the underlying socket
// drops or errors (so a disconnect is surfaced, not silent), with the close code when one is known;
// `logger` is the loud-logging sink for boundary failures (an undecodable CONTROL payload).
export interface TransportHooks {
  readonly authToken?: string;
  onControl?: (message: RelayControlMessage) => void;
  onClose?: (event: SocketCloseEvent) => void;
  readonly logger?: Logger<CollabEvent>;
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
    if (hooks.authToken !== undefined) {
      socket.send(framed(AUTH, new TextEncoder().encode(hooks.authToken)));
    }
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
    else if (data[0] === CONTROL) {
      const message = decodeControlMessage(new TextDecoder().decode(payload));
      if (message === null) {
        hooks.logger?.log(stamp("error", "collab", "control-rejected"));
        return;
      }
      hooks.onControl?.(message);
    }
  });
  const onClose = hooks.onClose;
  if (onClose !== undefined) socket.onClose((event) => onClose(event));
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
      // A relay drop surfaces as `close` (carrying the server's close code); a failed connection as
      // `error` (which is also followed by `close` in browsers, but Node's WebSocket may only emit
      // `error`) — fire the listener once, preferring the close event's code when both arrive.
      let fired = false;
      const once = (event: SocketCloseEvent): void => {
        if (fired) return;
        fired = true;
        listener(event);
      };
      ws.addEventListener("close", (e) => once({ code: e.code, reason: e.reason }));
      ws.addEventListener("error", () => once({ code: null, reason: "socket error" }));
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
// = the backoff cap was exhausted, we've given up; `rejected` = the relay closed with a POLICY code
// (1008/1009) — retrying would replay the same rejection, so we stop immediately. `disconnected` and
// `rejected` are when the consumer `onClose` fires.
export type ReconnectStatus = "reconnecting" | "reconnected" | "disconnected" | "rejected";

// Injected impurities + tuning for `reconnectingWebSocketTransport`, so the backoff schedule is fully
// deterministic under test. `now`/`schedule`/`random` replace `Date.now`/`setTimeout`/`Math.random`;
// `mkSocket` mints the inner socket (defaults to `webSocketTransport`, overridable for tests). The
// backoff is `min(baseMs * 2^attempt, capMs)` plus up to `jitter` × that of random jitter; after
// `maxRetries` consecutive failed attempts we declare `disconnected`. `logger` logs a policy rejection
// loudly at this boundary.
export interface ReconnectDeps {
  readonly mkSocket?: (url: string) => CollabSocket;
  readonly schedule?: (run: () => void, delayMs: number) => void;
  readonly random?: () => number;
  readonly baseMs?: number;
  readonly capMs?: number;
  readonly jitter?: number;
  readonly maxRetries?: number;
  readonly onStatus?: (status: ReconnectStatus) => void;
  readonly logger?: Logger<CollabEvent>;
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
// silently, a permanent one is surfaced. A POLICY close (1008/1009 — the relay REJECTED us) is never
// retried: replaying it can't succeed and hammers the relay, so it surfaces immediately as `rejected`.
// A `ReconnectStatus` is reported throughout for the UI.
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
  const closeListeners: Array<(event: SocketCloseEvent) => void> = [];

  let inner: CollabSocket = mkSocket(url);
  let attempt = 0;
  // Set on a user-initiated close AND on a permanent failure (policy rejection / exhausted budget) —
  // either way no further reconnect may run.
  let stopped = false;
  let reconnectedPending = false;

  const report = (s: ReconnectStatus): void => deps.onStatus?.(s);

  const surfaceClose = (event: SocketCloseEvent): void => {
    for (const l of closeListeners) l(event);
  };

  // Wire a fresh inner socket to the held consumer listeners. On its open we reset the retry counter and
  // re-fire the consumer `onOpen` (state re-exchange). On its close we schedule a reconnect — unless the
  // close is a policy rejection, which is permanent; the consumer `onClose` fires only on permanent
  // failures.
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
    socket.onClose((event) => {
      if (stopped) return;
      if (isPolicyClose(event)) {
        stopped = true;
        deps.logger?.log(stamp("error", "collab", "relay-rejected"));
        report("rejected");
        surfaceClose(event);
        return;
      }
      reconnect();
    });
  };

  const reconnect = (): void => {
    if (stopped) return;
    if (attempt >= maxRetries) {
      stopped = true;
      report("disconnected");
      surfaceClose({ code: null, reason: "reconnect retries exhausted" });
      return;
    }
    const delay = backoffDelay(attempt, base, cap, jitter, random);
    attempt += 1;
    reconnectedPending = true;
    report("reconnecting");
    schedule(() => {
      if (stopped) return;
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
      stopped = true;
      inner.close();
    },
  };
};
