import type { IconPack } from "./registry.js";
import simpleIcons from "../../vendor/simpleicons.json";

// Bundled AGPL-compatible OSS packs, sourced with pinned provenance by tools/source-icons.mjs.
// The JSON's `icons` object becomes the core's name→SVG Map at module load.
export const simpleIconsPack: IconPack = {
  meta: simpleIcons.meta,
  icons: new Map(Object.entries(simpleIcons.icons)),
};

export const vendoredPacks: readonly IconPack[] = [simpleIconsPack];
