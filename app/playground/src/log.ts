import { consoleLogger, stamp, type LogLevel } from "@m/std";

// The app's boundary-logging seam (AGENTS.md §8): structured JSON lines with a closed event union —
// never free-form console.error strings. `data` carries the per-occurrence detail (the error message,
// the offending key/value); the EVENT is the stable, grep-able identity of the failure class.
export type AppEvent =
  | "auth-login-failed"
  | "clipboard-write-failed"
  | "collab-disconnected"
  | "collapse-state-load-failed"
  | "collapse-state-persist-failed"
  | "edge-label-rejected"
  | "export-blob-null"
  | "export-context-unavailable"
  | "icon-decode-failed"
  | "icon-pack-decode-failed"
  | "icon-pack-parse-failed"
  | "icon-resolve-failed"
  | "layout-failed"
  | "layout-style-persist-failed"
  | "layout-style-read-failed"
  | "layout-style-unknown"
  | "minimap-pref-persist-failed"
  | "minimap-pref-read-failed"
  | "overlay-identity-attach-failed"
  | "overlay-rejected"
  | "parse-failed"
  | "relabel-rejected"
  | "relax-failed"
  | "style-select-unknown"
  | "swatch-accent-unknown"
  | "url-hash-malformed"
  | "ws-override-rejected";

export const appLog = (level: LogLevel, event: AppEvent, data: string | null = null): void => {
  consoleLogger.log(stamp(level, "app", event, data));
};
