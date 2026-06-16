import { type IconPack, singleCategory } from "./registry.js";
import devicon from "../../vendor/devicon.json";
import gilbarbara from "../../vendor/gilbarbara.json";
import k8s from "../../vendor/k8s.json";
import simpleIcons from "../../vendor/simpleicons.json";

// Bundled AGPL-compatible OSS packs, sourced with pinned provenance by tools/source-icons.mjs.
// Each JSON's `icons` object becomes the core's name→SVG Map at module load. simple-icons/devicon/
// gilbarbara are brand-logo packs (category "brands"); the k8s set is resource shapes.
const pack = (
  meta: IconPack["meta"],
  icons: ReadonlyMap<string, string>,
  category: string,
): IconPack => ({ meta, icons, categories: singleCategory(category, icons) });

export const simpleIconsPack: IconPack = pack(
  simpleIcons.meta,
  new Map(Object.entries(simpleIcons.icons)),
  "brands",
);
export const deviconPack: IconPack = pack(
  devicon.meta,
  new Map(Object.entries(devicon.icons)),
  "brands",
);
export const gilbarbaraPack: IconPack = pack(
  gilbarbara.meta,
  new Map(Object.entries(gilbarbara.icons)),
  "brands",
);
export const k8sPack: IconPack = pack(k8s.meta, new Map(Object.entries(k8s.icons)), "resources");

export const vendoredPacks: readonly IconPack[] = [
  simpleIconsPack,
  deviconPack,
  gilbarbaraPack,
  k8sPack,
];
