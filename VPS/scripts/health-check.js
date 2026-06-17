#!/usr/bin/env node

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeoutMs = Number.parseInt(args.timeout || "5000", 10);
  const urls = String(args.url || "http://127.0.0.1:4100/health")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const results = [];
  for (const url of urls) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Health check failed for ${url} with status ${response.status}.`);
    }

    const payload = await response.json().catch(() => null);
    results.push({
      url,
      status: response.status,
      success: payload?.success !== false
    });
  }

  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
