import { err, ok, type Result } from "@m/std";

// Every pack carries provenance (AGENTS.md §0.5): where it came from, its license, and a pinned
// version/commit. The icon set is name → SVG markup.
export interface IconPackMeta {
  readonly id: string;
  readonly license: string;
  readonly source: string;
  readonly version: string;
}

export interface IconPack {
  readonly meta: IconPackMeta;
  readonly icons: ReadonlyMap<string, string>;
  // Groups icon names by category (e.g. "brands", "compute", "network"). Every icon appears in at
  // least one category; a "brands" category holds vendor/brand logos.
  readonly categories: ReadonlyMap<string, readonly string[]>;
}

export interface IconRegistry {
  readonly packs: ReadonlyMap<string, IconPack>;
}

export interface IconError {
  readonly kind: "icon";
  readonly message: string;
}

export const findIcon = (
  registry: IconRegistry,
  packId: string,
  name: string,
): Result<string, IconError> => {
  const pack = registry.packs.get(packId);
  if (pack === undefined) return err({ kind: "icon", message: `unknown icon pack: ${packId}` });
  const svg = pack.icons.get(name);
  if (svg === undefined) return err({ kind: "icon", message: `unknown icon: ${packId}/${name}` });
  return ok(svg);
};

export const packNames = (pack: IconPack): readonly string[] => [...pack.icons.keys()];

export const categoryNames = (pack: IconPack): readonly string[] => [...pack.categories.keys()];

export const iconsInCategory = (pack: IconPack, category: string): readonly string[] =>
  pack.categories.get(category) ?? [];

// Builds a single-category map (all icon names under `category`) — for packs that are uniform
// (e.g. a brand-logo pack is all "brands").
export const singleCategory = (
  category: string,
  icons: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> => new Map([[category, [...icons.keys()]]]);

// Pure registry merge: returns a new registry with `pack` added (or replacing one of the same id).
export const registerPack = (registry: IconRegistry, pack: IconPack): IconRegistry => {
  const packs = new Map(registry.packs);
  packs.set(pack.meta.id, pack);
  return { packs };
};
