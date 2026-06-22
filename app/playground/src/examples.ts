export const SAMPLE = `flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C(Process)
  B -->|no| D(End)
  C --> D
`;

export const EXAMPLES = new Map<string, string>([
  ["flowchart", SAMPLE],
  [
    "sequence",
    "sequenceDiagram\n  participant U as User\n  participant W as WebApp\n  participant A as API\n  participant D as Database\n  U->>W: submit order\n  W->>A: POST /orders\n  A->>D: insert order\n  D-->>A: id\n  A-->>W: created\n  W-->>U: confirmation\n",
  ],
  [
    "c4",
    'C4Context\n  Person(alice, "Alice", "A customer")\n  Boundary(b, "Backend") {\n    Container(api, "API", "Handles requests")\n    Container(db, "Database")\n  }\n  Rel(alice, api, "uses")\n  Rel(api, db, "reads/writes")\n',
  ],
  ["block", 'block-beta\n  columns 2\n  a["Web"]\n  b["API"]\n  c["DB"]\n  a --> b\n  b --> c\n'],
  [
    "network",
    'network\n  cloud net "Internet"\n  router r1 "Edge"\n  server web "Web"\n  net -- r1\n  r1 -- web : "eth0"\n',
  ],
  [
    "cloud",
    'cloud\n  group "AWS" {\n    compute web "Web"\n    storage assets "Assets"\n    database db "Orders"\n    queue jobs "Jobs"\n    cdn edge "Edge"\n  }\n  web -- db\n',
  ],
  [
    "state",
    "stateDiagram-v2\n  state fork <<fork>>\n  state join <<join>>\n  state choice <<choice>>\n  [*] --> Idle\n  Idle --> choice : submit\n  choice --> fork : accepted\n  choice --> Error : rejected\n  fork --> Cache\n  fork --> Notify\n  Cache --> join\n  Notify --> join\n  join --> Ready\n  Ready --> [*]\n  note right of Error : retry with corrected input\n",
  ],
  [
    "er",
    "erDiagram\n  CUSTOMER {\n    string id PK\n    string email UK\n    int loyalty_points\n  }\n  ORDER {\n    int id PK\n    string status\n    date placed_at\n  }\n  LINE_ITEM {\n    int qty\n    int product_id FK\n  }\n  PRODUCT {\n    int id PK\n    string sku UK\n    string name\n  }\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  PRODUCT ||--o{ LINE_ITEM : appears_in\n",
  ],
  [
    "class",
    "classDiagram\n  class Animal {\n    <<abstract>>\n    +String name\n    -int age\n    +isMammal() bool\n    +move() void\n  }\n  class Swimmer {\n    <<interface>>\n    +swim() void\n  }\n  class Duck {\n    +String beak\n  }\n  Animal <|-- Duck\n  Swimmer <|.. Duck\n  Animal *-- Habitat\n  Duck o-- Pond\n  Duck ..> Food : eats\n",
  ],
  [
    "requirement",
    "requirementDiagram\n  requirement user_req {\n    id: 1\n    text: the user shall log in.\n    risk: high\n    verifymethod: test\n  }\n  functionalRequirement login_req {\n    id: 1.1\n    text: validate credentials.\n    risk: medium\n    verifymethod: test\n  }\n  element login_form {\n    type: simulation\n  }\n  user_req - contains -> login_req\n  login_form - satisfies -> login_req\n  login_form - verifies -> user_req\n",
  ],
  [
    "gitGraph",
    'gitGraph\n  commit id: "init"\n  commit id: "setup"\n  branch develop\n  commit id: "feature-a"\n  commit id: "feature-b"\n  checkout main\n  commit id: "hotfix"\n  merge develop tag: "v1.0"\n  commit id: "release"\n',
  ],
  [
    "timeline",
    "timeline\n  title Mermollusc roadmap\n  section Foundations\n    Parser : Flowchart : Sequence\n    Layout : ELK routing\n  section Visuals\n    Renderer : Canvas : SVG export\n    Families : ER : Class : Gantt\n  section Sharing\n    Demo : GitHub Pages\n    Collaboration : Presence\n",
  ],
  [
    "mindmap",
    "mindmap\n  root((mermollusc))\n    Origins\n      Mermaid\n      PlantUML\n    Families\n      Flowchart\n      Sequence\n      Timeline\n    Output\n      Canvas\n      SVG\n",
  ],
  [
    "pie",
    'pie showData donut\n  title Diagram family coverage\n  "Flow / state" : 34\n  "Structure" : 28\n  "Planning" : 18\n  "Architecture" : 20\n',
  ],
  [
    "gantt",
    "gantt\n  title Project Plan\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  tickInterval 1week\n  section Planning\n    Research :done, res, 2024-01-01, 5d\n    Design :active, des, after res, 1w\n  section Build\n    Implement :impl, after des, 2w\n    Docs :docs, after des, 1w\n    Test :test, after impl docs, 5d\n    Launch :milestone, ml, after test, 0d\n",
  ],
  [
    "dot",
    'digraph G {\n  rankdir=LR\n  start [shape=box]\n  start -> parse\n  subgraph cluster_core {\n    label="core"\n    parse -> layout -> render\n  }\n  layout -> parse [label="relax"]\n  render [shape=diamond]\n}\n',
  ],
]);
