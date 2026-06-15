#!/usr/bin/env node
// Fetches an AGPL-compatible OSS icon pack at a PINNED commit and writes a provenance-stamped pack
// JSON into modules/icons/vendor/<id>.json (consumed at runtime via @m/icons `decodePack`).
//
// Requires network. Pins MUST be full 40-char commit SHAs verified against the live repo and at
// least 24h old (AGENTS §0.3) — never branch names. Only bundleable licenses (Apache-2.0, MIT,
// CC0) belong here; AWS/Azure/GCP asset packs are NOT redistributable — load those at runtime with
// `decodePack` instead. The PACKS table is intentionally empty: fill it with values discovered and
// verified against the live repos, then run. Do not commit guessed commits, paths, or licenses.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "modules/icons/vendor");

// Each entry's repo/ref/license/paths were verified against the live repo before committing
// (license via the GitHub API, commit ≥24h old, every path probed for HTTP 200). Add more the same
// way — never paste a guessed commit, path, or license.
const PACKS = {
  // simple-icons: CC0-1.0 brand marks. The SVG files are public domain; the *trademarks* remain the
  // respective owners' (use to depict, not to imply endorsement). AWS/Azure marks were removed from
  // simple-icons at the owners' request, so they are not here — load those at runtime if needed.
  simpleicons: {
    repo: "simple-icons/simple-icons",
    ref: "0fc52ed37564358d91c764b762fba913090cd26b",
    license: "CC0-1.0",
    icons: {
      googlecloud: "icons/googlecloud.svg",
      googlecloudstorage: "icons/googlecloudstorage.svg",
      kubernetes: "icons/kubernetes.svg",
      docker: "icons/docker.svg",
      terraform: "icons/terraform.svg",
      ansible: "icons/ansible.svg",
      nginx: "icons/nginx.svg",
      redis: "icons/redis.svg",
      postgresql: "icons/postgresql.svg",
      mongodb: "icons/mongodb.svg",
      cloudflare: "icons/cloudflare.svg",
      grafana: "icons/grafana.svg",
      prometheus: "icons/prometheus.svg",
      helm: "icons/helm.svg",
      istio: "icons/istio.svg",
      apachekafka: "icons/apachekafka.svg",
      rabbitmq: "icons/rabbitmq.svg",
      elasticsearch: "icons/elasticsearch.svg",
      githubactions: "icons/githubactions.svg",
    },
  },
  // devicon: MIT. Colored brand/tool logos — includes the AWS/Azure/GCP/Oracle marks (the official
  // *architecture* icon sets remain non-redistributable; these are the brand logos). Trademarks
  // remain the owners'. Names are friendly aliases; paths are the verified devicon files.
  devicon: {
    repo: "devicons/devicon",
    ref: "7330accdbc47e2dc0c19789a48533c4a3c50fe58",
    license: "MIT",
    icons: {
      aws: "icons/amazonwebservices/amazonwebservices-original-wordmark.svg",
      azure: "icons/azure/azure-original.svg",
      googlecloud: "icons/googlecloud/googlecloud-original.svg",
      oracle: "icons/oracle/oracle-original.svg",
      kubernetes: "icons/kubernetes/kubernetes-original.svg",
      docker: "icons/docker/docker-original.svg",
      podman: "icons/podman/podman-original.svg",
      terraform: "icons/terraform/terraform-original.svg",
      ansible: "icons/ansible/ansible-original.svg",
      vagrant: "icons/vagrant/vagrant-original.svg",
      nginx: "icons/nginx/nginx-original.svg",
      cloudflare: "icons/cloudflare/cloudflare-original.svg",
      digitalocean: "icons/digitalocean/digitalocean-original.svg",
      heroku: "icons/heroku/heroku-original.svg",
      redis: "icons/redis/redis-original.svg",
      postgresql: "icons/postgresql/postgresql-original.svg",
      mongodb: "icons/mongodb/mongodb-original.svg",
      mysql: "icons/mysql/mysql-original.svg",
      sqlite: "icons/sqlite/sqlite-original.svg",
      elasticsearch: "icons/elasticsearch/elasticsearch-original.svg",
      kibana: "icons/kibana/kibana-original.svg",
      apachekafka: "icons/apachekafka/apachekafka-original.svg",
      rabbitmq: "icons/rabbitmq/rabbitmq-original.svg",
      grafana: "icons/grafana/grafana-original.svg",
      prometheus: "icons/prometheus/prometheus-original.svg",
      helm: "icons/helm/helm-original.svg",
      rancher: "icons/rancher/rancher-original.svg",
      consul: "icons/consul/consul-original.svg",
      vault: "icons/vault/vault-original.svg",
      jenkins: "icons/jenkins/jenkins-original.svg",
      gitlab: "icons/gitlab/gitlab-original.svg",
      github: "icons/github/github-original.svg",
    },
  },
  // gilbarbara/logos: CC0-1.0. Per-*service* cloud icons (AWS/GCP service marks) — complements
  // devicon's brand logos. A curated cloud subset of the ~1900 logos; trademarks remain the owners'.
  gilbarbara: {
    repo: "gilbarbara/logos",
    ref: "42037415f0df19cd82b3853c18a967a81783f921",
    license: "CC0-1.0",
    icons: {
      "aws-ec2": "logos/aws-ec2.svg",
      "aws-s3": "logos/aws-s3.svg",
      "aws-lambda": "logos/aws-lambda.svg",
      "aws-rds": "logos/aws-rds.svg",
      "aws-aurora": "logos/aws-aurora.svg",
      "aws-dynamodb": "logos/aws-dynamodb.svg",
      "aws-eks": "logos/aws-eks.svg",
      "aws-ecs": "logos/aws-ecs.svg",
      "aws-fargate": "logos/aws-fargate.svg",
      "aws-cloudfront": "logos/aws-cloudfront.svg",
      "aws-cloudformation": "logos/aws-cloudformation.svg",
      "aws-cloudwatch": "logos/aws-cloudwatch.svg",
      "aws-api-gateway": "logos/aws-api-gateway.svg",
      "aws-elb": "logos/aws-elb.svg",
      "aws-iam": "logos/aws-iam.svg",
      "aws-sqs": "logos/aws-sqs.svg",
      "aws-sns": "logos/aws-sns.svg",
      "aws-kinesis": "logos/aws-kinesis.svg",
      "aws-glacier": "logos/aws-glacier.svg",
      "aws-cognito": "logos/aws-cognito.svg",
      "google-cloud": "logos/google-cloud.svg",
      "google-cloud-functions": "logos/google-cloud-functions.svg",
      "google-cloud-run": "logos/google-cloud-run.svg",
      kubernetes: "logos/kubernetes.svg",
      docker: "logos/docker.svg",
      terraform: "logos/terraform.svg",
      nginx: "logos/nginx.svg",
      redis: "logos/redis.svg",
      postgresql: "logos/postgresql.svg",
      mongodb: "logos/mongodb.svg",
    },
  },
};

const SHA = /^[0-9a-f]{40}$/;

const fail = (msg) => {
  console.error(`source-icons: ${msg}`);
  process.exit(1);
};

const raw = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) fail(`fetch failed (${res.status}): ${url}`);
  return (await res.text()).trim();
};

const main = async () => {
  const id = process.argv[2];
  if (id === undefined) fail("usage: node tools/source-icons.mjs <packId>");
  const spec = PACKS[id];
  if (spec === undefined) {
    fail(`no spec for "${id}" — add it to PACKS with a verified pinned commit before running`);
  }
  if (!SHA.test(spec.ref)) {
    fail(`pack "${id}" ref must be a full 40-char commit SHA (a pin, not a branch)`);
  }

  const icons = {};
  for (const [name, path] of Object.entries(spec.icons)) {
    icons[name] = await fetchText(raw(spec.repo, spec.ref, path));
  }
  const pack = {
    meta: {
      id,
      license: spec.license,
      source: `https://github.com/${spec.repo}/tree/${spec.ref}`,
      version: spec.ref,
    },
    icons,
  };
  await mkdir(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${id}.json`);
  await writeFile(out, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`source-icons: wrote ${out} (${Object.keys(icons).length} icons, ${spec.license})`);
};

await main();
