// Sanctioned boundary: untyped external icon-pack data (a parsed JSON file or HTTP body) enters
// only through `decode()` and leaves as a branded `IconPack` or a loud error. Vendor cloud packs
// (AWS/Azure/GCP) are loaded this way at runtime — never bundled/redistributed.

import { decode, type DecodeError, map, type Result } from "@m/std";
import { z } from "zod";
import { type IconPack, singleCategory } from "../core/index.js";

// A static icon glyph has no business carrying script, external fetches, or event handlers. An
// exported `.svg` embeds the pack markup as an `<image href="data:…">`, so hostile markup would ride
// into the artifact and act if a victim later opens it top-level. The old regex denylist missed
// whole classes (`<image href="http…">`, external `<use href>`, SMIL `<set>/<animate>`), so glyphs
// are now vetted structurally against an ELEMENT + ATTRIBUTE ALLOWLIST: every tag and every
// attribute must be recognised, and every href must stay internal (`#…`) or be an inline
// `data:image/<raster>` payload (SVG data URIs can nest script, so they are rejected too). Anything else rejects the whole pack at the decode boundary (fail loud —
// never silently stripped). Pure string scanning, so it runs identically in the browser shell and
// under vitest.
//
// The allowlist covers the SVG drawing vocabulary the bundled packs actually use (authored arch/
// bpmn/sketch glyphs plus the vendored simple-icons / devicon / gilbarbara / k8s sets, which carry
// Inkscape/sodipodi/Dublin-Core editor metadata — inert, deliberately allowed via their namespace
// prefixes). Extend it deliberately when a new pack needs more; a miss fails decoding with the
// offending name in the error.
const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "a",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "metadata",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
]);

// Element-name prefixes for inert editor/RDF metadata subtrees (Inkscape, Sodipodi, Creative
// Commons, Dublin Core) that the vendored packs carry inside `<metadata>`.
const ALLOWED_ELEMENT_PREFIXES: readonly string[] = ["cc:", "dc:", "rdf:", "sodipodi:"];

const ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  "id",
  "class",
  "viewbox",
  "version",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "offset",
  "href",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "stop-color",
  "stop-opacity",
  "opacity",
  "color",
  "display",
  "visibility",
  "overflow",
  "transform",
  "clip-path",
  "clip-rule",
  "mask",
  "style",
  "gradientunits",
  "gradienttransform",
  "patternunits",
  "patterntransform",
  "preserveaspectratio",
  "pointer-events",
  "vector-effect",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "role",
  "focusable",
  // Inkscape `sodipodi:namedview` canvas-state attributes (inert editor metadata).
  "pagecolor",
  "bordercolor",
  "borderopacity",
  "showgrid",
  "fit-margin-top",
  "fit-margin-left",
  "fit-margin-right",
  "fit-margin-bottom",
]);

// Attribute-name prefixes: XML namespaces, editor metadata, and generic data/ARIA attributes — all
// inert. `xlink:href` is NOT here; it funnels through the same href check as `href`.
const ALLOWED_ATTR_PREFIXES: readonly string[] = [
  "xmlns",
  "xml:",
  "inkscape:",
  "sodipodi:",
  "dc:",
  "cc:",
  "rdf:",
  "data-",
  "aria-",
];

// An href may point inside the document (`#id` — gradient/clip/use references) or carry an inline
// RASTER payload. Everything else — http(s), protocol-relative, `javascript:`, any `data:` text
// type, and `data:image/svg+xml` (which can nest scriptable SVG) — is an external fetch or an
// execution vector and rejects the glyph.
const hrefAllowed = (value: string): boolean => {
  const v = value.trim();
  return v.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp)[;,]/i.test(v);
};

// A style value may only reference internal paint servers: `url(#…)` is fine, any other `url(…)`
// (an external fetch) or an `@import`/`expression(` is not.
const styleAllowed = (value: string): boolean =>
  !/url\s*\(\s*(?!(['"]?#))/i.test(value) && !/@import|expression\s*\(/i.test(value);

const TAG = /<\s*\/?\s*([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR = /([A-Za-z_][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

const elementAllowed = (name: string): boolean =>
  ALLOWED_ELEMENTS.has(name) || ALLOWED_ELEMENT_PREFIXES.some((p) => name.startsWith(p));

const attrAllowed = (name: string): boolean =>
  ALLOWED_ATTRS.has(name) || ALLOWED_ATTR_PREFIXES.some((p) => name.startsWith(p));

// Scan one glyph's markup; null when clean, otherwise a human-readable reason (the first violation).
// Exported so tests can sweep the bundled packs through the exact production check.
export const svgViolation = (svg: string): string | null => {
  // Well-formed comments are inert in XML; strip them so tag-looking text inside doesn't trip the
  // scan. An unterminated comment opener means the rest of the input escapes scanning — reject it.
  const noComments = svg.replace(/<!--[\s\S]*?-->/g, "");
  if (noComments.includes("<!--")) return "unterminated comment";
  if (/<!\[CDATA\[/i.test(noComments)) return "CDATA section";
  if (/<!DOCTYPE/i.test(noComments)) return "DOCTYPE declaration";
  // The only processing instruction a glyph legitimately carries is the XML declaration.
  const noXmlDecl = noComments.replace(/<\?xml[\s\S]*?\?>/gi, "");
  if (noXmlDecl.includes("<?")) return "processing instruction";

  // Walk every tag; the stretches between tags (`residue`) must be plain text — a stray `<` there
  // is a malformed or smuggled tag (e.g. an unclosed `<script`), which strict XML would reject too.
  let residue = "";
  let last = 0;
  for (const m of noXmlDecl.matchAll(TAG)) {
    residue += noXmlDecl.slice(last, m.index);
    last = m.index + m[0].length;
    const rawName = m[1] ?? "";
    const name = rawName.toLowerCase();
    if (!elementAllowed(name)) return `element <${rawName}> is not allowlisted`;
    const attrsChunk = m[2] ?? "";
    for (const a of attrsChunk.matchAll(ATTR)) {
      const attrRaw = a[1] ?? "";
      const attrName = attrRaw.toLowerCase();
      const value = (a[2] ?? "").replace(/^["']|["']$/g, "");
      if (attrName === "href" || attrName === "xlink:href") {
        if (!hrefAllowed(value)) return `external href "${value}" on <${rawName}>`;
        continue;
      }
      if (!attrAllowed(attrName))
        return `attribute "${attrRaw}" on <${rawName}> is not allowlisted`;
      if (attrName === "style" && !styleAllowed(value))
        return `external url()/import in style on <${rawName}>`;
    }
  }
  residue += noXmlDecl.slice(last);
  if (residue.includes("<")) return "malformed markup (unparsed '<')";
  return null;
};

const safeSvg = z.string().superRefine((v, ctx) => {
  const violation = svgViolation(v);
  if (violation !== null)
    ctx.addIssue({ code: "custom", message: `unsafe icon SVG: ${violation}` });
});

const IconPackJson = z.object({
  meta: z.object({
    id: z.string().min(1),
    license: z.string().min(1),
    source: z.string().min(1),
    version: z.string().min(1),
  }),
  // name → SVG markup; a JSON object at the boundary, converted to the core's Map below.
  icons: z.record(z.string(), safeSvg),
  // Optional category → icon-names grouping; when absent, all icons fall under "all".
  categories: z.record(z.string(), z.array(z.string())).optional(),
});

// Decode an untyped pack payload (e.g. `await (await fetch(url)).json()`) into an `IconPack`.
export const decodePack = (input: unknown): Result<IconPack, DecodeError> =>
  map(decode(IconPackJson, input), (json) => {
    const icons = new Map(Object.entries(json.icons));
    const categories =
      json.categories === undefined
        ? singleCategory("all", icons)
        : new Map(Object.entries(json.categories));
    return { meta: json.meta, icons, categories };
  });
