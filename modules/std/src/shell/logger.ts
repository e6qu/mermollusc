import type { LogLevel, Logger, LogRecord } from "../core/log.js";

export const consoleLogger: Logger = {
  log(record: LogRecord): void {
    const line = JSON.stringify(record);
    const loud: ReadonlySet<LogLevel> = new Set<LogLevel>(["warn", "error"]);
    if (loud.has(record.level)) console.error(line);
    else console.log(line);
  },
};
