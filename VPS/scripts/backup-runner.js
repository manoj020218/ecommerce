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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
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

async function pruneOldBackups(backupDir, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return [];
  }

  const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const removed = [];
  const entries = await fs.readdir(backupDir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidatePath = path.join(backupDir, entry.name);
    const stat = await fs.stat(candidatePath);
    if (stat.mtimeMs >= threshold) {
      continue;
    }

    await fs.rm(candidatePath, { recursive: true, force: true });
    removed.push(candidatePath);
  }

  return removed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(process.cwd(), args["source-root"] || ".");
  const backupDir = path.resolve(sourceRoot, args["backup-dir"] || "backups");
  const dryRun = args["dry-run"] === "true";
  const label = String(args.label || "jenix-commerce").trim() || "jenix-commerce";
  const retentionDays = Number.parseInt(args["retention-days"] || "14", 10);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(backupDir, `${timestamp}-${label}`);

  const includeEntries = [
    ".env",
    "backend/src/database/json",
    "backend/uploads",
    "apps/front/dist",
    "apps/admin-panel/dist",
    "ecosystem.config.cjs",
    "package.json",
    "pnpm-lock.yaml"
  ];

  const manifest = {
    createdAt: new Date().toISOString(),
    sourceRoot,
    targetDir,
    label,
    entries: []
  };

  for (const relativePath of includeEntries) {
    const absolutePath = path.join(sourceRoot, relativePath);
    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const stat = await fs.stat(absolutePath);
    manifest.entries.push({
      relativePath,
      type: stat.isDirectory() ? "directory" : "file"
    });
  }

  if (!dryRun) {
    await fs.mkdir(targetDir, { recursive: true });
    for (const entry of manifest.entries) {
      await copyRecursive(
        path.join(sourceRoot, entry.relativePath),
        path.join(targetDir, entry.relativePath)
      );
    }

    await fs.writeFile(
      path.join(targetDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );
    manifest.pruned = await pruneOldBackups(backupDir, retentionDays);
  }

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
