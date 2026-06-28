import * as fs from "node:fs";
import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagram } from "@m/parser";
import { defaultTheme, toDisplayList, toSvg } from "@m/renderer";
import { isOk } from "@m/std";
import { describe, it } from "vitest";

const code = `cloud
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
  worker --> cw : "logs"`;

const segmentsOf = (wp) => {
  const out = [];
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1];
    const b = wp[i];
    if (a !== undefined && b !== undefined) out.push([a, b]);
  }
  return out;
};

const orthSegmentsCross = (a1, a2, b1, b2) => {
  const aHoriz = a1.y === a2.y;
  if (aHoriz === (b1.y === b2.y)) return false;
  const h1 = aHoriz ? a1 : b1;
  const h2 = aHoriz ? a2 : b2;
  const v1 = aHoriz ? b1 : a1;
  const v2 = aHoriz ? b2 : a2;
  return (
    v1.x > Math.min(h1.x, h2.x) &&
    v1.x < Math.max(h1.x, h2.x) &&
    h1.y > Math.min(v1.y, v2.y) &&
    h1.y < Math.max(v1.y, v2.y)
  );
};

const orthSegmentsOverlap = (a1, a2, b1, b2) => {
  const aHoriz = a1.y === a2.y;
  if (aHoriz !== (b1.y === b2.y)) return false;
  if (aHoriz) {
    if (Math.abs(a1.y - b1.y) > 1) return false;
    const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
    const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
    return hi - lo > 2;
  }
  if (Math.abs(a1.x - b1.x) > 1) return false;
  const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
  const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
  return hi - lo > 2;
};

const totalConflicts = (edges) => {
  const segs = edges.map((e) => segmentsOf(e.waypoints));
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const si = segs[i];
      const sj = segs[j];
      if (si === undefined || sj === undefined) continue;
      for (const [a, b] of si)
        for (const [c, d] of sj)
          if (orthSegmentsCross(a, b, c, d) || orthSegmentsOverlap(a, b, c, d)) n++;
    }
  }
  return n;
};

const routeLength = (pts) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a !== undefined && b !== undefined) len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return len;
};

const totalLength = (edges) =>
  edges.reduce((acc, e) => acc + routeLength(e.waypoints), 0);

const totalBends = (edges) =>
  edges.reduce((acc, e) => acc + Math.max(0, e.waypoints.length - 2), 0);

describe("render one combination", () => {
  it("renders and writes output", async () => {
    const parsed = parseDiagram(code);
    if (!isOk(parsed)) throw new Error("Parse failed");

    const laid = await layoutDiagram(parsed.value, heuristicMeasure);
    if (!isOk(laid)) throw new Error("Layout failed");

    const scene = laid.value;
    const MARGIN = 32;

    const displayList = toDisplayList(scene, false);
    const svgOptions = {
      width: scene.extent.size.width + 2 * MARGIN,
      height: scene.extent.size.height + 2 * MARGIN,
      origin: scene.extent.origin,
      margin: MARGIN,
      theme: defaultTheme,
      icons: new Map(),
    };

    const svg = toSvg(displayList, svgOptions);

    const conflicts = totalConflicts(scene.edges);
    const length = totalLength(scene.edges);
    const bends = totalBends(scene.edges);

    const resolvedPath = fs.existsSync("app/playground")
      ? "app/playground/sweep_temp.json"
      : "sweep_temp.json";

    fs.writeFileSync(
      resolvedPath,
      JSON.stringify({ svg, conflicts, length, bends }),
      "utf-8"
    );
  });
});
