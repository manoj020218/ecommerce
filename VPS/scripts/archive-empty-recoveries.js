#!/usr/bin/env node
// One-off cleanup (2026-09-27). Moves empty, anonymous, already-expired
// abandoned-cart records out of recovery-store.json into an archive file.
//
// Why: getCart() created one such record per page view with an empty cart
// (~550/day). They have no items, no contact, never reached checkout and never
// got a reminder, so they can never be recovered — but they grew the store to
// 32 MB and pushed the backend over pm2's 600 MB limit ~20x/day. The code bug
// is fixed in abandoned-cart.service.js (writeTrackedRecovery).
//
// Nothing is deleted: moved records go to recovery-store.archive-<date>.json
// next to the store. Run ONLY while jenix-backend is stopped (the app's own
// write queue would otherwise overwrite this result with its stale copy).
//
// Usage (from VPS/):  node scripts/archive-empty-recoveries.js [--dry-run]

const fs = require("node:fs");
const path = require("node:path");

const storePath = path.resolve(process.cwd(), "backend/src/database/json/recovery-store.json");
const dryRun = process.argv.includes("--dry-run");

const isJunk = (r) =>
  r &&
  r.stage === "expired" &&
  !(Number(r.cartItemCount || 0) > 0) &&
  !r.userId &&
  !r.email &&
  !r.mobile &&
  !r.checkoutSessionId &&
  !r.paymentAttemptId &&
  !r.recoveredOrderId &&
  !(Number(r.reminderCount || 0) > 0);

const raw = fs.readFileSync(storePath, "utf8");
const store = JSON.parse(raw);
const all = Array.isArray(store.recoveries) ? store.recoveries : [];
const junk = all.filter(isJunk);
const keep = all.filter((r) => !isJunk(r));

console.log(`records: ${all.length}  move to archive: ${junk.length}  keep: ${keep.length}`);
if (dryRun) {
  console.log("dry run - nothing written");
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 10);
const archivePath = storePath.replace(/\.json$/, `.archive-${stamp}.json`);
if (fs.existsSync(archivePath)) {
  console.error(`archive already exists: ${archivePath} - refusing to overwrite`);
  process.exit(1);
}

// 1) archive first (full records), 2) then atomically replace the store
fs.writeFileSync(archivePath, JSON.stringify({ archivedAt: new Date().toISOString(), reason: "empty anonymous expired carts", recoveries: junk }), "utf8");
const archivedBack = JSON.parse(fs.readFileSync(archivePath, "utf8")).recoveries.length;
if (archivedBack !== junk.length) {
  console.error("archive verification failed - store NOT modified");
  process.exit(1);
}

store.recoveries = keep;
const tmp = storePath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
fs.renameSync(tmp, storePath);

console.log(`archived -> ${archivePath}`);
console.log(`store now ${(fs.statSync(storePath).size / 1e6).toFixed(2)} MB (was ${(raw.length / 1e6).toFixed(2)} MB)`);
