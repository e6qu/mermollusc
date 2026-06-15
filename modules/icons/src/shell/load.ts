// Sanctioned boundary: untyped external icon-pack data (a parsed JSON file or HTTP body) enters
// only through `decode()` and leaves as a branded `IconPack` or a loud error. Vendor cloud packs
// (AWS/Azure/GCP) are loaded this way at runtime — never bundled/redistributed (AGENTS §5).

import { decode, type DecodeError, map, type Result } from "@m/std";
import { z } from "zod";
import type { IconPack } from "../core/index.js";

const IconPackJson = z.object({
  meta: z.object({
    id: z.string().min(1),
    license: z.string().min(1),
    source: z.string().min(1),
    version: z.string().min(1),
  }),
  // name → SVG markup; a JSON object at the boundary, converted to the core's Map below.
  icons: z.record(z.string(), z.string()),
});

// Decode an untyped pack payload (e.g. `await (await fetch(url)).json()`) into an `IconPack`.
export const decodePack = (input: unknown): Result<IconPack, DecodeError> =>
  map(decode(IconPackJson, input), (json) => ({
    meta: json.meta,
    icons: new Map(Object.entries(json.icons)),
  }));
