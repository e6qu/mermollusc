# @m/contracts — do next

- Add the next AST variants as families land: sequence, C4/architecture, block/network.
- Define the `LayoutOverrides` contract (`nodeId → { position, size?, pinned }`) shared by builder
  (writes) and layout (reads as ELK seeds/fixed positions).
- Add type-level tests (e.g. `expect-type`) pinning the discriminated unions.
- Keep AST and SceneGraph IR stable — downstream modules depend on these shapes.
