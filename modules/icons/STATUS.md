# @m/icons — status

**State:** registry + resolver + a built-in glyph pack; `make check` green.

- core: `IconPack` (provenance meta: id/license/source/version + name→SVG map), `IconRegistry`,
  `findIcon(registry, packId, name)` → `Result<svg, IconError>`, `packNames`.
- `builtinPack` ("arch"): original AGPL glyphs — server, database, cloud, user, queue; `defaultRegistry`.
- tests: 3 passing.
- Not yet: vendored OSS packs (Kubernetes/CNCF/simple-icons/devicon) with provenance; rendering
  icons inside nodes (Scene icon ref + renderer); loaders for user-supplied cloud packs.
