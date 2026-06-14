// The core never logs; the shell implements this and logs at boundaries.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  readonly ts: string;
  readonly level: LogLevel;
  readonly module: string;
  readonly event: string;
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

export interface Logger {
  log(record: LogRecord): void;
}
