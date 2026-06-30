export {
  edgeLabelAnchor,
  edgeLabelAnchorAt,
  labelLines,
  pathRatioNearest,
  toDisplayList,
  toDot,
} from "./core/index.js";
export type { DrawCmd, PathCmd } from "./core/index.js";
export { paint, toSvg, defaultTheme, darkTheme, htmlInCanvasSupported } from "./shell/index.js";
export type { Canvas2D, IconImages, Theme, SvgOptions } from "./shell/index.js";
