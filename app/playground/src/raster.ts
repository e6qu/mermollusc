// Turning an icon pack's raw SVG markup into something the canvas can draw.

// An <img> can only decode an SVG that declares its namespace and an intrinsic size. Inject each only
// if absent — vendored packs (e.g. simple-icons) already carry xmlns, and a duplicate attribute would
// make decoding fail.
export const svgDataUrl = (svg: string, color: string | null = null): string => {
  let markup = svg;
  if (!markup.includes("xmlns=")) {
    markup = markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  if (!/<svg[^>]*\swidth=/.test(markup)) {
    markup = markup.replace("<svg ", '<svg width="24" height="24" ');
  }
  // Authored line-art packs (bpmn/sketch/arch) stroke in `currentColor`; set the root `color` so they
  // pick up the active theme foreground. Brand packs carry their own colours (no `currentColor`), so
  // this is inert for them.
  if (color !== null) {
    markup = markup.replace("<svg ", `<svg style="color:${color}" `);
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
};

export const rasterizeIcon = async (
  svg: string,
  color: string | null = null,
): Promise<HTMLImageElement> => {
  const img = new Image();
  img.src = svgDataUrl(svg, color);
  await img.decode();
  return img;
};
