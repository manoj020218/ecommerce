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

async function copyRecursive(sourcePath, destinationPath) {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.mkdir(destinationPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(
        path.join(sourcePath, entry.name),
        path.join(destinationPath, entry.name)
      );
    }
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source) {
    throw new Error("Missing required --source argument.");
  }

  const backupPath = path.resolve(process.cwd(), args.source);
  const targetRoot = path.resolve(process.cwd(), args["target-root"] || ".");
  const dryRun = args["dry-run"] === "true";
  const manifestPath = path.join(backupPath, "manifest.json");
  const rawManifest = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(rawManifest);
  const restoredEntries = [];

  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("Backup manifest is empty or invalid.");
  }

  for (const entry of manifest.entries) {
    const sourceEntryPath = path.join(backupPath, entry.relativePath);
    const targetEntryPath = path.join(targetRoot, entry.relativePath);
    restoredEntries.push({
      relativePath: entry.relativePath,
      targetEntryPath
    });

    if (!dryRun) {
      await copyRecursive(sourceEntryPath, targetEntryPath);
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        source: backupPath,
        targetRoot,
        dryRun,
        restoredEntries
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
