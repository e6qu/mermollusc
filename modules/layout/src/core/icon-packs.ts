// Pack ids of the bundled icon packs that layouts reference for default node glyphs. Named here so
// the literals aren't scattered across layouts; they must match the pack ids registered in @m/icons
// (a sibling we can't import — the icon ref `{ pack, name }` is the shared contract between them).
export const ARCH_PACK = "arch";
export const SIMPLE_ICONS_PACK = "simpleicons";
