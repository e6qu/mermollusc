# @m/icons — status

**State:** registry + resolver + a built-in glyph pack; `make check` green.

- core: `IconPack` (provenance meta: id/license/source/version + name→SVG map), `IconRegistry`,
  `findIcon(registry, packId, name)` → `Result<svg, IconError>`, `packNames`.
- `builtinPack` ("arch"): original AGPL glyphs — server, database, cloud, user, queue, router,
  switch, firewall, host (names match the network node kinds 1:1); `defaultRegistry`.
- **In-node rendering is wired**: layout sets a `SceneNode.icon` (`IconRef`); the renderer emits an
  `icon` draw command; the app resolves the ref via `findIcon`, rasterises the SVG, and hands the
  image map to `paint`. Driven today by network node kinds.
- tests: 3 passing.
- Not yet: vendored OSS packs (Kubernetes/CNCF/simple-icons/devicon) with provenance; loaders for
  user-supplied cloud packs.
