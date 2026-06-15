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
