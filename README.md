# mermollusc

A parser, visualiser, and **two-way builder** for Mermaid-style diagrams, extended to
software-architecture families. Write text, see a diagram; edit the diagram, the text updates.
TypeScript, HTML Canvas, no runtime diagram dependency beyond [ELK](https://github.com/kieler/elkjs)
for graph layout.

> This is the user-facing intro. Contributors should read **[AGENTS.md](AGENTS.md)** (the operating
> contract) and **[PLAN.md](PLAN.md)** (architecture, decisions, status). Each module under
> `modules/` carries its own `PLAN`/`STATUS`/`WHAT_WE_DID`/`DO_NEXT`/`BUGS`.

## What it does

- **Fifteen diagram families** render in the browser, **plus DOT/Graphviz import**: flowchart,
  sequence, C4 context, block, network, cloud, state, **ER** (crow's-foot cardinality + attribute
  compartments), **class** (UML inheritance/composition/aggregation heads, field/method compartments,
  `«stereotype»`s), **requirement** (SysML requirement/element boxes + the seven relationship verbs),
  **gitGraph**, **timeline**, **mindmap**, **pie**, and **Gantt**. A Graphviz `digraph`/`graph` can be
  pasted in and imports as a flowchart.
- **Two-way editing.** Double-click any node, edge, or label on the canvas to rename it in place;
  the edit is patched back into the source text (formatting and comments preserved). **Connect** and
  **Delete** work across every family whose grammar accepts the result (the chart-like pie and Gantt
  keep Connect off, with the reason shown); drag-to-move, box-select, group/lock, align/distribute,
  resize, and undo/redo work on any family's nodes; **Add node** covers the node-declaring families,
  **Relax** the node-graph families, and **Regenerate** re-lays-out every family.
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

**State** — `stateDiagram-v2`; transitions `A --> B : label`, the `[*]` start/end pseudo-states, and
nestable `state X { … }` composites.

```
stateDiagram-v2
  [*] --> Idle
  Idle --> Loading : fetch
  Loading --> Ready : ok
  Ready --> [*]
```

**ER** — `erDiagram`; crow's-foot relationships (`||--o{` etc., split into per-end cardinality) and
optional `ENTITY { type name PK,FK "comment" }` attribute blocks rendered as compartments.

```
erDiagram
  CUSTOMER {
    string name PK
    string email UK
  }
  CUSTOMER ||--o{ ORDER : places
```

**Class** — `classDiagram`; `class Foo { +field\n +method() }` bodies (visibility `+`/`-`/`#`/`~`,
field/method compartments), a `<<stereotype>>` line (any text — `<<interface>>`, `<<abstract>>`,
`<<service>>`, …), and UML relationship
operators `<|--` (inheritance) · `..|>` (realization) · `*--` (composition) · `o--` (aggregation) ·
`-->` (association) · `..>` (dependency).

```
classDiagram
  class Animal {
    <<abstract>>
    +String name
    +move() void
  }
  class Swimmer {
    <<interface>>
    +swim() void
  }
  Animal <|-- Duck
  Swimmer <|.. Duck
```

**Requirement** — `requirementDiagram`; `requirement`/`element` boxes with `key: value` bodies and the
seven SysML verbs (contains · copies · derives · satisfies · verifies · refines · traces).

```
requirementDiagram
  requirement user_req {
    id: 1
    text: the user shall log in.
    risk: high
  }
  element login_form {
    type: simulation
  }
  login_form - satisfies -> user_req
```

**gitGraph** — `commit`/`branch`/`checkout`/`merge` with `id:`/`tag:` annotations; a deterministic
lane layout (commits march along the axis, each branch owns a lane).

```
gitGraph
  commit id: "init"
  branch develop
  commit id: "feature-a"
  checkout main
  commit id: "hotfix"
  merge develop tag: "v1.0"
```

**Timeline** — `title`, `section` groupings, and `period : event : event` lines.

```
timeline
  title Mermollusc roadmap
  section Foundations
    Parser : Flowchart : Sequence
    Layout : ELK routing
  section Visuals
    Renderer : Canvas : SVG export
```

**Mindmap** — indentation defines the hierarchy; shapes `((circle))` · `(rounded)` · `[square]` ·
`{{hexagon}}` · plain.

```
mindmap
  root((mermollusc))
    Origins
      Mermaid
      PlantUML
    Families
      Flowchart
      Sequence
```

**Pie** — `pie [showData] [donut]`, optional `title`, and `"label" : value` rows.

```
pie showData donut
  title Diagram family coverage
  "Flow / state" : 34
  "Structure" : 28
  "Planning" : 18
```

**Gantt** — `dateFormat`, `excludes`/`tickInterval` directives, `section`s, and
`Task :status, id, start, duration` rows (`start` is a date or `after <id…>`).

```
gantt
  title Project Plan
  dateFormat YYYY-MM-DD
  excludes weekends
  section Planning
    Research :done, res, 2024-01-01, 5d
    Design :active, des, after res, 1w
  section Build
    Implement :impl, after des, 2w
    Launch :milestone, ml, after impl, 0d
```

**DOT import** — paste a Graphviz `digraph`/`graph { … }` (node/edge statements, `a -> b -> c`
chains, `rankdir`, `cluster*` subgraphs, `label`/`shape`/`style` attrs); it imports as a flowchart.

```
digraph G {
  rankdir=LR
  start [shape=box]
  start -> parse
  subgraph cluster_core {
    label="core"
    parse -> layout -> render
  }
}
```

## Architecture

A pnpm-workspace monorepo. Text flows through the pipeline; the builder closes the loop back to text:

```
text ──▶ parser ──AST──▶ layout ──SceneGraph IR──▶ renderer ──▶ canvas
                                                      ▲
                        builder (hit-test, drag, two-way sync) ┘

std ◀ contracts ◀ { parser, layout, renderer, icons } ◀ builder ◀ collab ◀ app
                                                        relay (Go) ◀ app (dev server / e2e)
```

The functional core is pure (branded data → `Result`, no IO); the shell does canvas, the ELK worker,
decoding, and logging. `@m/collab` is the Yjs-backed collaboration layer behind the default-off
`?collab` flag; `modules/relay` is its optional Go relay (native binary in production, WASM in the
backend-free demo). See [PLAN.md](PLAN.md) for the full design.

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
