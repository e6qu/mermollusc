// Feature detection for the experimental "HTML in Canvas" capability (Chromium, behind a flag):
// drawing live DOM into a 2D context, which would let nodes render rich HTML labels. It is NOT in
// any stable browser, so this returns false everywhere today — it exists only so a host can opt
// into a richer backend *if* the API ever ships, without the renderer depending on it. The default
// `paint` path is always the supported one.
//
// Candidate entry points across the proposal's iterations (`drawElement`, `placeElement`); detected
// by presence, never called here.
export const htmlInCanvasSupported = (): boolean => {
  if (typeof CanvasRenderingContext2D === "undefined") return false;
  const proto = CanvasRenderingContext2D.prototype;
  return "drawElement" in proto || "placeElement" in proto;
};
