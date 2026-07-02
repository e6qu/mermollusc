// The core never logs; the shell implements this and logs at boundaries. Each module narrows
// `TEvent` to its own closed union so events are never free-form strings at the call site.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord<TEvent extends string = string> {
  readonly ts: string;
  readonly level: LogLevel;
  readonly module: string;
  readonly event: TEvent;
  // Free-form diagnostic detail (an error message, the offending key/url) — the part of a log line
  // that ISN'T the closed-union event. Required (null when there is none), per the no-optional rule.
  readonly data: string | null;
}

export interface Logger<TEvent extends string = string> {
  log(record: LogRecord<TEvent>): void;
}
