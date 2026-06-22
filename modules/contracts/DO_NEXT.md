# @m/contracts — do next

- Add the next AST variants as families land: sequence, C4/architecture, block/network.
- Define the `LayoutOverrides` contract (`nodeId → { position, size?, pinned }`) shared by builder
  (writes) and layout (reads as ELK seeds/fixed positions).
- Add type-level tests (e.g. `expect-type`) pinning the discriminated unions.
- Keep AST and SceneGraph IR stable — downstream modules depend on these shapes.
- *(done)* Sidecar groups include a required label for editor-owned group titles.
- *(done)* State-specific Scene rendering intent is explicit through `SceneNode.role`, instead of
  overloading generic shapes for initial/final/fork/join/note glyphs.
