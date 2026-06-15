import type { IconPack } from "./registry.js";
import devicon from "../../vendor/devicon.json";
import gilbarbara from "../../vendor/gilbarbara.json";
import k8s from "../../vendor/k8s.json";
import simpleIcons from "../../vendor/simpleicons.json";

// Bundled AGPL-compatible OSS packs, sourced with pinned provenance by tools/source-icons.mjs.
// Each JSON's `icons` object becomes the core's name→SVG Map at module load.
export const simpleIconsPack: IconPack = {
  meta: simpleIcons.meta,
  icons: new Map(Object.entries(simpleIcons.icons)),
};

export const deviconPack: IconPack = {
  meta: devicon.meta,
  icons: new Map(Object.entries(devicon.icons)),
};

export const gilbarbaraPack: IconPack = {
  meta: gilbarbara.meta,
  icons: new Map(Object.entries(gilbarbara.icons)),
};

export const k8sPack: IconPack = {
  meta: k8s.meta,
  icons: new Map(Object.entries(k8s.icons)),
};

export const vendoredPacks: readonly IconPack[] = [
  simpleIconsPack,
  deviconPack,
  gilbarbaraPack,
  k8sPack,
];
