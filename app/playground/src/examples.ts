export const SAMPLE = `flowchart TD
  A[Start] --> B{Authorized?} icon "arch/firewall"
  B -->|yes| C[Process] icon "arch/server"
  B -->|no| D[End] icon "arch/firewall"
  C --> D
`;

// A tiered AWS-style architecture with enough routing to show cloud groups, icons, labels, and async
// work without turning the public demo into an unreadable edge stress test. Vendor logo packs remain
// available from the icon picker; the starter uses built-in line-art glyphs for visual coherence.
const CLOUD_AWS = `cloud
  group "Edge" {
    cdn cf "CloudFront" icon "arch/cdn"
    compute waf "AWS WAF" icon "arch/firewall"
  }
  group "Routing" {
    compute alb "App Load Balancer" icon "arch/load-balancer"
  }
  group "Services" {
    compute web "web service" icon "arch/microservice"
    compute orders "orders service" icon "arch/microservice"
    compute worker "worker" icon "arch/container"
  }
  database rds "Aurora" icon "arch/database"
  compute cognito "Cognito" icon "arch/key"
  compute cw "CloudWatch" icon "arch/server"
  cf --> waf : "public"
  waf --> alb : "web"
  alb --> web : "HTTP"
  web --> orders : "orders"
  orders --> cognito : "auth"
  orders --> rds : "SQL"
  orders --> worker : "async"
  worker --> cw : "logs"
`;

// A BPMN-style order-to-cash workflow drawn as a flowchart: lane-like subgraphs, circle events, a payment
// gateway, task glyphs, and labelled sequence flows. It stays intentionally compact so the public demo is
// readable; deeper workflow branches belong in regression fixtures, not the starter menu.
const BPMN_ORDER = `flowchart TD
  subgraph Intake
    placed((Order placed)) icon "bpmn/start-event"
    validate([Validate order]) icon "bpmn/task"
  end
  subgraph Payment
    charge([Charge card]) icon "bpmn/task"
    approved{Payment approved?} icon "bpmn/exclusive-gateway"
    cancel([Cancel order]) icon "bpmn/task"
  end
  subgraph Fulfilment
    pick([Pick & pack]) icon "bpmn/task"
    ship([Ship order]) icon "bpmn/task"
    notify([Notify customer]) icon "bpmn/message-event"
    fulfilled((Order fulfilled)) icon "bpmn/end-event"
  end
  placed --> validate
  validate --> charge
  charge --> approved
  approved -->|approved| pick
  approved -->|declined| cancel
  pick --> ship
  ship --> notify
  notify --> fulfilled
  cancel --> notify
`;

// A second BPMN flow: an incident-response process with severity branching and a closeout handoff. It
// avoids feedback loops in the starter so the diagram demonstrates the family without edge clutter.
const BPMN_INCIDENT = `flowchart TD
  subgraph Detection
    alert((Alert raised)) icon "bpmn/start-event"
    triage([Triage severity]) icon "bpmn/task"
    sev{Severity?} icon "bpmn/exclusive-gateway"
  end
  subgraph Response
    page([Page on-call]) icon "bpmn/message-event"
    mitigate([Mitigate]) icon "bpmn/task"
    verify{Resolved?} icon "bpmn/exclusive-gateway"
  end
  subgraph Closeout
    postmortem([Write post-mortem]) icon "bpmn/task"
    closed((Incident closed)) icon "bpmn/end-event"
  end
  alert --> triage --> sev
  sev -->|sev1| page
  sev -->|sev2/3| mitigate
  page --> mitigate
  mitigate --> verify
  verify -->|resolved| postmortem
  postmortem --> closed
`;

export const EXAMPLES = new Map<string, string>([
  ["flowchart", SAMPLE],
  ["bpmn", BPMN_ORDER],
  ["bpmn-incident", BPMN_INCIDENT],
  [
    "sequence",
    "sequenceDiagram\n  participant U as User\n  participant W as WebApp\n  participant A as API\n  participant D as Database\n  U->>W: submit order\n  W->>A: POST /orders\n  note over A,D: write in a transaction\n  A->>D: insert order\n  D-->>A: id\n  A-->>W: created\n  note left of U: sees confirmation\n  W-->>U: confirmation\n",
  ],
  [
    "c4",
    'C4Context\n  Person(customer, "Customer", "A registered shopper")\n  Boundary(shop, "Online Shop") {\n    Container(web, "Web app", "React SPA")\n    Container(api, "API", "Spring Boot")\n    Container(db, "Order DB", "PostgreSQL")\n  }\n  Rel(customer, web, "uses")\n  Rel(web, api, "calls")\n  Rel(api, db, "reads")\n',
  ],
  [
    "block",
    'block-beta\n  columns 3\n  lb["Load balancer"]:3\n  block:app:3\n    columns 3\n    web1["web-1"]\n    web2["web-2"]\n    web3["web-3"]\n  end\n  api["API gateway"]:3\n  cache["Redis cache"]\n  db["Postgres"]\n  store["Object store"]\n  lb --> web1\n  web1 --> api\n  api --> cache\n  api --> db\n  api --> store\n',
  ],
  [
    "network",
    'network\n  cloud net "Internet"\n  group "DMZ" {\n    firewall fw "Edge firewall"\n    server lb "Load balancer"\n  }\n  group "App tier" {\n    server web "web service"\n  }\n  group "Data tier" {\n    database db "Postgres"\n  }\n  net -- fw : "WAN"\n  fw -- lb : "443/tcp"\n  lb -- web : "HTTPS"\n  web -- db : "SQL"\n',
  ],
  ["cloud", CLOUD_AWS],
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
    'gitGraph\n  commit\n  commit\n  branch develop\n  checkout develop\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout develop\n  merge feature\n  commit\n  checkout main\n  merge develop tag: "v1.0"\n  branch hotfix\n  checkout hotfix\n  commit type: HIGHLIGHT\n  checkout main\n  merge hotfix tag: "v1.0.1"\n  checkout develop\n  merge main\n',
  ],
  [
    "timeline",
    "timeline\n  title Mermollusc roadmap\n  section Foundations\n    Parser : Flowchart : Sequence\n    Layout : ELK routing\n  section Visuals\n    Renderer : Canvas : SVG export\n    Families : ER : Class : Gantt\n  section Sharing\n    Demo : GitHub Pages\n    Collaboration : Presence\n",
  ],
  [
    "mindmap",
    "mindmap\n  root((Trip to Japan))\n    Transport\n      [JR Pass]\n      (Domestic flights)\n    Cities\n      Tokyo\n        Shibuya\n        Akihabara\n      Kyoto\n        Temples\n      Osaka\n    Food\n      {{Ramen}}\n      (Sushi)\n      Street food\n",
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
