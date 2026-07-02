import type { LogLevel, Logger, LogRecord } from "../core/log.js";

export const consoleLogger: Logger = {
  log(record: LogRecord): void {
    const line = JSON.stringify(record);
    const loud: ReadonlySet<LogLevel> = new Set<LogLevel>(["warn", "error"]);
    if (loud.has(record.level)) console.error(line);
    else console.log(line);
  },
};

// Stamps a `LogRecord` with the current time (ISO-8601), so callers don't hand-roll `ts`. Shell-only
// (the wall clock is impure); the core never logs. `TEvent` keeps the event a closed union per module.
export const stamp = <TEvent extends string>(
  level: LogLevel,
  module: string,
  event: TEvent,
  data: string | null = null,
): LogRecord<TEvent> => ({ ts: new Date().toISOString(), level, module, event, data });
