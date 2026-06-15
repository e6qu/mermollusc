// The core never logs; the shell implements this and logs at boundaries. Each module narrows
// `TEvent` to its own closed union so events are never free-form strings at the call site.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord<TEvent extends string = string> {
  readonly ts: string;
  readonly level: LogLevel;
  readonly module: string;
  readonly event: TEvent;
}

export interface Logger<TEvent extends string = string> {
  log(record: LogRecord<TEvent>): void;
}
