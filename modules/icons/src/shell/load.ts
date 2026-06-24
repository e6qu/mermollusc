// Sanctioned boundary: untyped external icon-pack data (a parsed JSON file or HTTP body) enters
// only through `decode()` and leaves as a branded `IconPack` or a loud error. Vendor cloud packs
// (AWS/Azure/GCP) are loaded this way at runtime — never bundled/redistributed.

import { decode, type DecodeError, map, type Result } from "@m/std";
import { z } from "zod";
import { type IconPack, singleCategory } from "../core/index.js";

// A static icon glyph has no business carrying script or event handlers. An exported `.svg` embeds the
// pack markup as an `<image href="data:…">`, so a pack with `<script>`/`onload=`/`<foreignObject>` would
// ride into the artifact and execute if a victim later opens it top-level. Reject such markup at the
// decode boundary (fail loud) — covering both the canvas-render and export paths in one place.
const UNSAFE_SVG = /<script\b|<foreignobject\b|\son\w+\s*=|javascript:|data:text\/html/i;
const safeSvg = z.string().refine((v) => !UNSAFE_SVG.test(v), {
  message: "icon SVG may not contain scripts, event handlers, or foreignObject",
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
