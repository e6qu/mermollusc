export const SAMPLE = `flowchart TD
  A[Start] --> B{Authorized?} icon "devicon/vault"
  B -->|yes\\nverified| C[Process] icon "devicon/kubernetes"
  B -->|no| D[End] icon "devicon/cloudflare"
  C --> D
`;

// A tiered AWS-style architecture with enough routing to show cloud groups, icons, labels, and async
// work without turning the public demo into an unreadable edge stress test.
const CLOUD_AWS = `cloud
  group "Edge" {
    cdn cf "CloudFront" icon "gilbarbara/aws-cloudfront"
    compute waf "AWS WAF" icon "devicon/cloudflare"
    compute shield "Shield" icon "devicon/vault"
  }
  group "Routing" {
    compute alb "App Load Balancer" icon "gilbarbara/aws-elb"
    compute api "API Gateway" icon "gilbarbara/aws-api-gateway"
  }
  group "Services" {
    compute web "web service" icon "devicon/nginx"
    compute apiSvc "api service" icon "devicon/nodejs"
    compute orders "orders service" icon "devicon/docker"
  }
  group "Async" {
    queue events "event bus" icon "gilbarbara/aws-kinesis"
    queue jobs "job queue" icon "gilbarbara/aws-sqs"
    compute worker "worker" icon "gilbarbara/aws-lambda"
  }
  group "Data" {
    database rds "Aurora" icon "gilbarbara/aws-aurora"
    storage s3 "Assets" icon "gilbarbara/aws-s3"
    database redis "Redis" icon "devicon/redis"
  }
  group "Security" {
    compute cognito "Cognito" icon "gilbarbara/aws-cognito"
    compute secrets "Secrets" icon "devicon/vault"
  }
  group "Operations" {
    compute cw "CloudWatch" icon "gilbarbara/aws-cloudwatch"
    compute grafana "Dashboards" icon "devicon/grafana"
    queue dlq "DLQ" icon "gilbarbara/aws-sqs"
  }
  cf --> waf : "public"
  waf --> shield : "inspect"
  shield --> alb : "web"
  alb --> api : "route"
  alb --> web : "HTTP"
  api --> apiSvc
  web --> orders
  apiSvc --> orders
  orders --> cognito
  orders --> rds : "SQL"
  orders --> redis : "cache"
  web --> s3
  orders --> events
  events --> jobs : "fan out"
  jobs --> worker : "async"
  worker --> cw : "logs"
  cw --> grafana : "metrics"
  worker --> dlq : "failed jobs"
  secrets --> apiSvc
`;

const NETWORK_ENTERPRISE = `network
  group "Edge" {
    cloud net "Internet" icon "devicon/cloudflare"
    firewall fw "Edge firewall" icon "devicon/vault"
    router rtr "Border router" icon "devicon/nginx"
    server lb "Load balancer" icon "gilbarbara/aws-elb"
  }
  group "Core" {
    group "App tier" {
      switch sw "App switch" icon "k8s/svc"
      server web "web service" icon "devicon/nginx"
      server api "api service" icon "devicon/nodejs"
      server jobs "jobs" icon "devicon/docker"
    }
    group "Data tier" {
      database db "Postgres" icon "devicon/postgresql"
      server cache "Redis" icon "devicon/redis"
      server queue "Kafka" icon "devicon/apachekafka"
    }
  }
  group "Ops" {
    host admin "Admin jumpbox" icon "devicon/docker"
    server mon "Monitoring" icon "devicon/prometheus"
    server dash "Dashboards" icon "devicon/grafana"
  }
  net -- fw : "WAN"
  fw -- rtr : "filtered"
  rtr -- lb : "443/tcp"
  lb -- web : "HTTPS"
  lb -- api : "API"
  web -- sw : "east-west"
  sw -- api : "RPC"
  api -- db : "SQL"
  api -- cache : "cache"
  api -- queue : "events"
  queue -- jobs : "consume"
  admin -- sw : "SSH"
  mon -- api : "metrics"
  mon -- dash : "panels"
`;

// A compact BPMN-style retail banking onboarding workflow with real BPMN glyphs.
const BPMN_ORDER = `flowchart TB
  received((Received)) icon "bpmn/start-message"
  capture([Capture data]) icon "bpmn/user-task"
  documents{Docs complete?} icon "bpmn/exclusive-gateway"
  request([Request docs]) icon "bpmn/send-task"
  kyc([KYC / AML]) icon "bpmn/business-rule-task"
  fraud([Fraud score]) icon "bpmn/service-task"
  approve{Decision} icon "bpmn/inclusive-gateway"
  docs([Disclosures]) icon "bpmn/script-task"
  sign([E-signature]) icon "bpmn/receive-task"
  book([Book account]) icon "bpmn/service-task"
  funded((Funded)) icon "bpmn/end-message"
  reject([Adverse action]) icon "bpmn/send-task"
  declined((Declined)) icon "bpmn/end-error"
  received --> capture --> documents
  documents -->|no| request --> capture
  documents -->|yes| kyc --> fraud --> approve
  approve -->|decline| reject
  approve -->|approve| docs --> sign --> book --> funded
  reject --> declined
`;

// A compact BPMN-style insurance adjusting workflow with triage, coverage, inspection, and settlement.
const BPMN_INCIDENT = `flowchart TB
  reported((Reported)) icon "bpmn/start-message"
  intake([Record FNOL]) icon "bpmn/user-task"
  classify([Classify loss]) icon "bpmn/business-rule-task"
  policy([Policy lookup]) icon "bpmn/service-task"
  coverage{Covered?} icon "bpmn/exclusive-gateway"
  denial([Denial letter]) icon "bpmn/send-task"
  assign([Assign adjuster]) icon "bpmn/user-task"
  inspect([Inspect loss]) icon "bpmn/manual-task"
  estimate([Repair estimate]) icon "bpmn/script-task"
  review{Review?} icon "bpmn/exclusive-gateway"
  payment([Authorize pay]) icon "bpmn/service-task"
  close((Closed)) icon "bpmn/end-message"
  reported --> intake --> classify --> policy --> coverage
  coverage -->|no| denial
  coverage -->|yes| assign --> inspect --> estimate --> review
  review -->|needs revision| inspect
  review -->|approved| payment --> close
`;

export const EXAMPLES = new Map<string, string>([
  ["flowchart", SAMPLE],
  ["bpmn", BPMN_ORDER],
  ["bpmn-incident", BPMN_INCIDENT],
  [
    "sequence",
    "sequenceDiagram\n  participant U as User\n  participant W as WebApp\n  participant A as API\n  participant P as Payments\n  participant F as Fraud\n  participant Q as Queue\n  participant D as Database\n  U->>W: submit order\n  W->>A: POST /orders\n  A->>F: score basket\n  F-->>A: risk ok\n  A->>P: authorize payment\n  P-->>A: auth code\n  note over A,D: write in a transaction\n  A->>D: insert order\n  D-->>A: id\n  A->>Q: enqueue fulfilment\n  Q-->>A: accepted\n  A-->>W: created\n  note left of U: sees confirmation\n  W-->>U: confirmation\n",
  ],
  [
    "c4",
    'C4Context\n  Person(customer, "Customer", "A registered shopper")\n  Person(operator, "Support agent")\n  Boundary(shop, "Online Shop") {\n    Container(web, "Web app", "React SPA")\n    Container(api, "API", "Spring Boot")\n    Container(worker, "Worker", "Async jobs")\n    Container(db, "Order DB", "PostgreSQL")\n    Container(cache, "Cache", "Redis")\n  }\n  Rel(customer, web, "uses")\n  Rel(operator, web, "assists")\n  Rel(web, api, "calls")\n  Rel(api, cache, "reads")\n  Rel(api, db, "writes")\n  Rel(api, worker, "queues")\n  Rel(worker, db, "updates")\n',
  ],
  [
    "block",
    'block-beta\n  columns 4\n  dns["DNS"]:2\n  cdn["CDN"]:2\n  lb["Load balancer"]:4\n  block:app:4\n    columns 4\n    web1["web-1"]\n    web2["web-2"]\n    api1["api-1"]\n    api2["api-2"]\n  end\n  queue["Jobs"]:2\n  worker["Worker"]:2\n  cache["Redis cache"]\n  db["Postgres"]\n  store["Object store"]\n  logs["Logs"]\n  dns --> cdn\n  cdn --> lb\n  lb --> web1\n  lb --> web2\n  web1 --> api1\n  web2 --> api2\n  api1 --> cache\n  api1 --> db\n  api2 --> queue\n  queue --> worker\n  worker --> store\n  worker --> logs\n',
  ],
  ["network", NETWORK_ENTERPRISE],
  ["cloud", CLOUD_AWS],
  [
    "state",
    "stateDiagram-v2\n  direction LR\n  state fork <<fork>>\n  state join <<join>>\n  state choice <<choice>>\n  state Fulfilment {\n    [*] --> Pick\n    Pick --> Pack\n    Pack --> HandOff\n    HandOff --> [*]\n  }\n  [*] --> Idle\n  Idle --> choice : submit\n  choice --> fork : accepted\n  choice --> Error : rejected\n  fork --> ReserveInventory\n  fork --> NotifyCustomer\n  ReserveInventory --> join\n  NotifyCustomer --> join\n  join --> Fulfilment\n  Fulfilment --> Ready\n  Ready --> [*]\n  Error --> Idle : correct\n  note right of Error : retry with corrected input\n",
  ],
  [
    "er",
    "erDiagram\n  CUSTOMER {\n    string id PK\n    string email UK\n    int loyalty_points\n  }\n  ORDER {\n    int id PK\n    string status\n    date placed_at\n  }\n  LINE_ITEM {\n    int qty\n    int product_id FK\n  }\n  PRODUCT {\n    int id PK\n    string sku UK\n    string name\n  }\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  PRODUCT ||--o{ LINE_ITEM : appears_in\n",
  ],
  [
    "class",
    "classDiagram\n  class Policy {\n    +String number\n    +Money premium\n    +isActive() bool\n  }\n  class Claim {\n    +String claimNo\n    +Date reportedAt\n    +reserve(amount) void\n  }\n  class Adjuster {\n    +String license\n    +assign(claim) void\n  }\n  class Payment {\n    +Money amount\n    +release() void\n  }\n  class FraudCheck {\n    <<service>>\n    +score(claim) int\n  }\n  Policy *-- Claim\n  Claim o-- Payment\n  Adjuster --> Claim : handles\n  FraudCheck ..> Claim : evaluates\n  Claim --> Policy : validates coverage\n",
  ],
  [
    "requirement",
    "requirementDiagram\n  requirement onboarding_req {\n    id: 1\n    text: onboarding shall complete KYC before account opening.\n    risk: high\n    verifymethod: inspection\n  }\n  functionalRequirement kyc_req {\n    id: 1.1\n    text: screen customer against sanctions and PEP lists.\n    risk: high\n    verifymethod: test\n  }\n  performanceRequirement sla_req {\n    id: 1.2\n    text: return a decision within two minutes for low-risk customers.\n    risk: medium\n    verifymethod: analysis\n  }\n  element onboarding_service {\n    type: service\n  }\n  element audit_log {\n    type: evidence store\n  }\n  onboarding_req - contains -> kyc_req\n  onboarding_req - contains -> sla_req\n  onboarding_service - satisfies -> kyc_req\n  onboarding_service - verifies -> sla_req\n  audit_log - traces -> onboarding_req\n",
  ],
  [
    "gitGraph",
    'gitGraph\n  commit\n  commit\n  branch develop\n  checkout develop\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout develop\n  merge feature\n  commit\n  checkout main\n  merge develop tag: "v1.0"\n  branch hotfix\n  checkout hotfix\n  commit type: HIGHLIGHT\n  checkout main\n  merge hotfix tag: "v1.0.1"\n  checkout develop\n  merge main\n',
  ],
  [
    "timeline",
    "timeline\n  title Mermollusc roadmap\n  section Foundations\n    Parser : Flowchart : Sequence : C4\n    Layout : ELK routing : family-specific layouts\n  section Visuals\n    Renderer : Canvas : SVG export : edge crossing hints\n    Families : ER : Class : Gantt : Timeline\n  section Sharing\n    Demo : GitHub Pages : richer examples\n    Collaboration : Presence : cursor overlays\n",
  ],
  [
    "mindmap",
    "mindmap\n  root((Claims transformation))\n    Intake\n      [Digital FNOL]\n      (Broker upload)\n      Triage rules\n    Adjustment\n      Coverage\n        Policy lookup\n        Exclusions\n      Estimating\n        Photos\n        Repair network\n    Payments\n      {{Fraud controls}}\n      Settlement offer\n      EFT release\n    Analytics\n      Leakage\n      Cycle time\n",
  ],
  [
    "pie",
    'pie showData donut\n  title Demo rendering coverage\n  "Flow / BPMN" : 28\n  "Architecture" : 24\n  "Planning" : 18\n  "Data models" : 16\n  "Collaboration" : 14\n',
  ],
  [
    "gantt",
    "gantt\n  title Claims Platform Release\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  tickInterval 1week\n  section Discovery\n    Field interviews :done, interviews, 2024-01-01, 5d\n    Target workflow :done, workflow, after interviews, 1w\n  section Build\n    FNOL intake :active, intake, after workflow, 2w\n    Coverage rules :rules, after workflow, 8d\n    Adjuster console :console, after intake, 2w\n    Payment handoff :payment, after rules, 1w\n  section Release\n    UAT :uat, after console payment, 5d\n    Launch :milestone, launch, after uat, 0d\n",
  ],
  [
    "dot",
    'digraph G {\n  rankdir=LR\n  intake [shape=box]\n  intake -> parse\n  parse -> validate\n  subgraph cluster_core {\n    label="core"\n    validate -> layout -> route -> render\n  }\n  route -> layout [label="relax"]\n  render -> export [label="canvas/svg"]\n  render -> inspect [label="hit test"]\n  inspect -> edit\n  edit -> parse [label="source patch"]\n  export [shape=diamond]\n}\n',
  ],
]);
