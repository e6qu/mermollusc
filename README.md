# mermollusc

A parser, visualiser, and **two-way builder** for Mermaid-style diagrams, extended to
software-architecture families. Write text, see a diagram; edit the diagram, the text updates.
TypeScript, HTML Canvas, no runtime diagram dependency beyond [ELK](https://github.com/kieler/elkjs)
for graph layout.

> This is the user-facing intro. Contributors should read **[AGENTS.md](AGENTS.md)** (the operating
> contract) and **[PLAN.md](PLAN.md)** (architecture, decisions, status). Each module under
> `modules/` carries its own `PLAN`/`STATUS`/`WHAT_WE_DID`/`DO_NEXT`/`BUGS`.

## What it does

- **Six diagram families** render in the browser: flowchart, sequence, C4 context, block, network,
  and cloud.
- **Two-way editing.** Double-click any node, edge, or label on the canvas to rename it in place;
  the edit is patched back into the source text (formatting and comments preserved). Flowchart also
  supports drag-to-move, add, connect, delete, and relax/regenerate layout.
- **Icons in nodes.** Network and cloud nodes show glyphs; any leaf can carry an explicit
  `icon "<pack>/<name>"` override. A built-in icon picker browses the bundled packs (simple-icons,
  devicon, gilbarbara, Kubernetes) by category and inserts the reference for you.
- **Themes.** Light / dark (persisted, follows your OS by default) plus a hand-drawn **sketch** mode.
- **Export & share.** Download the diagram as **PNG**, **PDF**, or a true-vector **SVG**, or copy a
  **share link** that encodes the diagram in the URL.

## Quick start

```sh
make install                 # install workspace deps (pnpm)
make -C app/playground run   # dev server on http://localhost:5173
make -C app/playground stop  # stop it
```

Then open the playground, pick a starter from the **Examples** menu, and edit either side.

## Syntax by family

Each diagram starts with a header keyword that selects the family.

**Flowchart** — shapes `[]` rect · `()` round · `([])` stadium · `(())` circle · `{}` diamond;
links `-->` `---` `-.->` `==>`; edge labels `-->|label|`.

```
flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C(Process)
  B -->|no| D(End)
  C --> D
```

**Sequence**

```
sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Hello
  B-->>A: Hi there
```

**C4 context** — `Person`/`System`/`Container(id, "label")`, nestable `Boundary(id, "label") { … }`,
`Rel(from, to, "label")`.

```
C4Context
  Person(alice, "Alice")
  Boundary(b, "Backend") {
    Container(api, "API")
    Container(db, "Database")
  }
  Rel(alice, api, "uses")
```

**Block** — `columns N` then `id["label"]` declarations and flowchart-style edges.

```
block-beta
  columns 2
  a["Web"]
  b["API"]
  c["DB"]
  a --> b
  b --> c
```

**Network** — kind-typed nodes (`server`/`database`/`cloud`/`router`/`switch`/`firewall`/`host`) and
undirected `--` links; an optional `icon "<pack>/<name>"` override per node.

```
network
  cloud net "Internet"
  router r1 "Edge"
  server web "Web"
  net -- r1
  r1 -- web : "eth0"
```

**Cloud** — nestable `group "label" { … }` with kind-typed leaves
(`compute`/`storage`/`database`/`queue`/`cdn`) and undirected links.

```
cloud
  group "AWS" {
    compute web "Web"
    storage assets "Assets"
  }
  web -- assets
```

## Architecture

A pnpm-workspace monorepo. Text flows through the pipeline; the builder closes the loop back to text:

```
text ──▶ parser ──AST──▶ layout ──SceneGraph IR──▶ renderer ──▶ canvas
                                                      ▲
                        builder (hit-test, drag, two-way sync) ┘

std ◀ contracts ◀ { parser, layout, renderer, icons } ◀ builder ◀ app
```

The functional core is pure (branded data → `Result`, no IO); the shell does canvas, the ELK worker,
decoding, and logging. See [PLAN.md](PLAN.md) for the full design.

## Development

```sh
make check                       # the gate: typecheck + lint + format + tests (all modules)
make -C app/playground test-e2e-ui   # Playwright UI flows
make -C app/playground shots         # drive the live UI and write PNGs to shots/ (visual review)
```

## License

[AGPL-3.0-or-later](LICENSE). Bundled icon packs are AGPL-compatible (CC0 / MIT / Apache-2.0) and
attributed; non-redistributable vendor icon sets (e.g. official AWS/Azure/GCP/Oracle/AliCloud
architecture icons) are never bundled — load them locally via `tools/pack-dir.mjs` and the
playground's **Load icons** button.
