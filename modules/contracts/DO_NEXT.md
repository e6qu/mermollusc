# @m/contracts — do next

- Add the next AST variants as families land: sequence, C4/architecture, block/network.
- *(done)* `LayoutOverrides` is the shared sidecar contract (`nodeId → { position, size?, pinned }`);
  `OverlayDoc.replaceOverrides` lets regenerate replace only the unpinned portion of the map.
- Add type-level tests (e.g. `expect-type`) pinning the discriminated unions.
- Keep AST and SceneGraph IR stable — downstream modules depend on these shapes.
- *(done)* Sidecar groups include a required label for editor-owned group titles.
- *(done)* State-specific Scene rendering intent is explicit through `SceneNode.role`, instead of
  overloading generic shapes for initial/final/fork/join/note glyphs.
- *(done)* State notes now carry `side` (`right`/`left`/`over`), and pie wedges carry `innerRadius` for
  donut slices.
