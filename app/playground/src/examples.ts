export const SAMPLE = `flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C(Process)
  B -->|no| D(End)
  C --> D
`;

// A realistic AWS web architecture with directed traffic paths. CloudFront serves static assets from
// S3 and forwards dynamic requests through AWS WAF, which splits to the ALB (web app) and API Gateway
// (the /api/* path); services read the data tier; the orders service fans async work onto SQS for a
// worker to consume; everything ships logs to CloudWatch. Service glyphs are the bundled gilbarbara
// AWS logos; WAF reuses the built-in firewall glyph.
const CLOUD_AWS = `cloud
  group "Edge" {
    storage assets "S3 static" icon "gilbarbara/aws-s3"
    cdn cf "CloudFront" icon "gilbarbara/aws-cloudfront"
    compute waf "AWS WAF" icon "arch/firewall"
  }
  group "Routing" {
    compute alb "App Load Balancer" icon "gilbarbara/aws-elb"
    compute apigw "API Gateway" icon "gilbarbara/aws-api-gateway"
  }
  group "ECS services" {
    compute web "web service" icon "gilbarbara/aws-ecs"
    compute orders "orders service" icon "gilbarbara/aws-fargate"
    compute auth "auth service" icon "gilbarbara/aws-ecs"
    compute worker "worker" icon "gilbarbara/aws-ecs"
  }
  group "Data tier" {
    database rds "Aurora" icon "gilbarbara/aws-rds"
    database ddb "DynamoDB" icon "gilbarbara/aws-dynamodb"
    queue jobs "SQS jobs" icon "gilbarbara/aws-sqs"
  }
  group "Identity & ops" {
    compute cognito "Cognito" icon "gilbarbara/aws-cognito"
    compute cw "CloudWatch" icon "gilbarbara/aws-cloudwatch"
  }
  cf --> assets : "static"
  cf --> waf : "dynamic"
  waf --> alb : "web"
  waf --> apigw : "/api/*"
  alb --> web : "HTTP"
  apigw --> orders : "REST"
  apigw --> auth : "REST"
  auth --> cognito : "verify JWT"
  web --> rds : "SQL"
  orders --> rds : "SQL"
  orders --> ddb : "sessions"
  orders --> jobs : "enqueue"
  jobs --> worker : "consume"
  worker --> rds : "SQL"
  web --> cw : "logs"
  orders --> cw : "logs"
  worker --> cw : "logs"
`;

// A BPMN-style order-to-cash workflow drawn as a flowchart: swimlanes via subgraphs, circle events
// (start/end), diamond gateways (decisions), rounded-rect tasks, and labelled sequence flows. The
// branches are semantically real: out-of-stock items are backordered before charging; a declined
// payment cancels the order (you can't refund a charge that never succeeded); a shipped order both
// completes and notifies the customer.
const BPMN_ORDER = `flowchart TD
  subgraph Customer
    placed((Order placed)) icon "bpmn/start-event"
    notify([Receive notification]) icon "bpmn/message-event"
  end
  subgraph Fulfilment
    validate([Validate order]) icon "bpmn/task"
    stock{In stock?} icon "bpmn/exclusive-gateway"
    backorder([Create backorder]) icon "bpmn/task"
    pick([Pick & pack]) icon "bpmn/task"
    ship([Ship order]) icon "bpmn/task"
    fulfilled((Order fulfilled)) icon "bpmn/end-event"
  end
  subgraph Payment
    charge([Charge card]) icon "bpmn/task"
    approved{Payment approved?} icon "bpmn/exclusive-gateway"
    cancel([Cancel order]) icon "bpmn/task"
  end
  placed --> validate
  validate --> stock
  stock -->|in stock| charge
  stock -->|backordered| backorder
  backorder --> charge
  charge --> approved
  approved -->|approved| pick
  approved -->|declined| cancel
  pick --> ship
  ship --> fulfilled
  ship --> notify
  cancel --> notify
`;

// A second BPMN flow: an incident-response process with an escalation loop and a timer-style timeout
// branch, showing gateways feeding back into earlier tasks.
const BPMN_INCIDENT = `flowchart TD
  subgraph Detection
    alert((Alert raised)) icon "bpmn/start-event"
    triage([Triage severity]) icon "bpmn/task"
    sev{Severity?} icon "bpmn/exclusive-gateway"
  end
  subgraph Response
    page([Page on-call]) icon "bpmn/message-event"
    ack{Acked in 5m?} icon "bpmn/timer-event"
    mitigate([Mitigate]) icon "bpmn/task"
    escalate([Escalate to lead]) icon "bpmn/task"
    verify{Resolved?} icon "bpmn/exclusive-gateway"
  end
  subgraph Closeout
    postmortem([Write post-mortem]) icon "bpmn/task"
    closed((Incident closed)) icon "bpmn/end-event"
  end
  alert --> triage --> sev
  sev -->|sev1| page
  sev -->|sev2/3| mitigate
  page --> ack
  ack -->|yes| mitigate
  ack -->|no| escalate
  escalate --> mitigate
  mitigate --> verify
  verify -->|no| escalate
  verify -->|yes| postmortem
  postmortem --> closed
`;

export const EXAMPLES = new Map<string, string>([
  ["flowchart", SAMPLE],
  ["bpmn", BPMN_ORDER],
  ["bpmn-incident", BPMN_INCIDENT],
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
