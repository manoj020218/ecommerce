#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function normalizeHost(value, fallback) {
  return String(value || fallback || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function serverBlock({ host, rootDir, ssl, isApi, backendPort }) {
  const certPath = `/etc/letsencrypt/live/${host}`;

  const bodyLines = isApi
    ? [
        "  location / {",
        `    proxy_pass http://127.0.0.1:${backendPort};`,
        "    proxy_http_version 1.1;",
        "    proxy_set_header Host $host;",
        "    proxy_set_header X-Real-IP $remote_addr;",
        "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
        "    proxy_set_header X-Forwarded-Proto $scheme;",
        "  }"
      ]
    : [
        `  root ${rootDir};`,
        "  index index.html;",
        "  location / {",
        "    try_files $uri $uri/ /index.html;",
        "  }"
      ];

  if (ssl) {
    const httpRedirect = [
      "server {",
      "  listen 80;",
      `  server_name ${host};`,
      "  return 301 https://$host$request_uri;",
      "}"
    ].join("\n");

    const httpsBlock = [
      "server {",
      "  listen 443 ssl http2;",
      `  server_name ${host};`,
      `  ssl_certificate ${certPath}/fullchain.pem;`,
      `  ssl_certificate_key ${certPath}/privkey.pem;`,
      ...bodyLines,
      "}"
    ].join("\n");

    return `${httpRedirect}\n\n${httpsBlock}`;
  }

  return [
    "server {",
    "  listen 80;",
    `  server_name ${host};`,
    ...bodyLines,
    "}"
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ssl = args.ssl === "true";
  const deployRoot = path.resolve(process.cwd(), args["deploy-root"] || ".");
  const frontendRoot = path.join(deployRoot, "apps/front/dist");
  const adminRoot = path.join(deployRoot, "apps/admin-panel/dist");
  const backendPort = Number.parseInt(args["backend-port"] || "4100", 10);
  const storefrontHost = normalizeHost(
    args["storefront-domain"],
    "businessdomain.com"
  );
  const adminHost = normalizeHost(
    args["admin-domain"],
    "admin.businessdomain.com"
  );
  const apiHost = normalizeHost(args["api-domain"], "api.businessdomain.com");

  const config = [
    serverBlock({
      host: storefrontHost,
      rootDir: frontendRoot,
      ssl,
      isApi: false
    }),
    serverBlock({
      host: adminHost,
      rootDir: adminRoot,
      ssl,
      isApi: false
    }),
    serverBlock({
      host: apiHost,
      ssl,
      isApi: true,
      backendPort
    })
  ].join("\n\n");

  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, config, "utf-8");
  }

  process.stdout.write(`${config}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
