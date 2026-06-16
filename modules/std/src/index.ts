export {
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  flatMap,
  unwrapOr,
  rectContains,
} from "./core/index.js";
export type {
  Result,
  Ok,
  Err,
  Brand,
  Px,
  Point,
  Size,
  Rect,
  LogLevel,
  LogRecord,
  Logger,
} from "./core/index.js";
export { brand, px, point, size, rect, decode, consoleLogger, stamp } from "./shell/index.js";
export type { DecodeError } from "./shell/index.js";
