# @m/icons — bugs

_None known._

## Resolved

- ~~**SVG sanitiser was a single regex denylist with known gaps.**~~ Fixed — the denylist missed
  `<image href="http…">` (remote fetch), external `<use href>`, and SMIL `<set>/<animate>`
  (attribute-rewriting animation). Replaced with a structural element/attribute allowlist
  (`svgViolation` in `src/shell/load.ts`): unknown elements/attributes, external or non-`data:image`
  hrefs, external style `url()`s, and markup that escapes the tag scan all reject the pack loudly at
  `decodePack`. Guarded by a sanitiser test suite and a sweep of every bundled glyph.

- ~~**STATUS glyph counts drifted from the code.**~~ Fixed — STATUS claimed 21 builtin ("arch") and
  41 BPMN glyphs; the packs actually hold 20 and 47 (counted from `src/core/builtin.ts` /
  `src/core/bpmn.ts`). Numbers corrected.
