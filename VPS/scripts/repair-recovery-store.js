#!/usr/bin/env node
// One-off repair (2026-09-27) for abandoned-cart records showing ₹0.
//
// 1. BACKFILL: records that reached checkout but had their saved cart
//    overwritten by an empty one (the live cart is emptied when an order is
//    placed; the next getCart() wiped the record — fixed in
//    abandoned-cart.service.js writeTrackedRecovery). Their checkout session in
//    auth-store still holds the real cart, so items/count/value are restored
//    from it. Stage, dates and everything else are left untouched.
// 2. ARCHIVE: logged-in customers' records that were created already empty and
//    expired in the same instant (no checkout, no payment, no reminder, no
//    order) — the same getCart() junk as archive-empty-recoveries.js, which
//    only handled anonymous ones. Moved to recovery-store.archive-<date>-b.json,
//    not deleted.
//
// Default is a dry run. Pass --apply to write. Run ONLY with jenix-backend
// stopped. Usage (from VPS/): node scripts/repair-recovery-store.js [--apply]

const fs = require("node:fs");
const path = require("node:path");

const dir = path.resolve(process.cwd(), "backend/src/database/json");
const storePath = path.join(dir, "recovery-store.json");
const apply = process.argv.includes("--apply");

const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const auth = JSON.parse(fs.readFileSync(path.join(dir, "auth-store.json"), "utf8"));
const sessions = new Map((auth.checkoutSessions || []).map((s) => [s.id, s]));
const all = Array.isArray(store.recoveries) ? store.recoveries : [];

// Same shape as summarizeCartView() in abandoned-cart.service.js
function summarize(cart) {
  const items = (Array.isArray(cart?.items) ? cart.items : []).map((item) => ({
    productId: item.productId,
    title: item.title || "",
    slug: item.slug || "",
    sku: item.sku || "",
    qty: Number(item.qty || 0),
    finalUnitPrice: Number(item.finalUnitPriceAfterDiscount || item.unitPrice || item.finalUnitPrice || 0),
    unitPrice: Number(item.unitPrice || 0),
    lineTotal: Number(item.lineTotal || 0),
    gstRate: Number(item.gstRate || 0),
    availabilityStatus: item.availabilityStatus || "unknown"
  }));
  return {
    cartItems: items,
    cartItemCount: items.reduce((sum, i) => sum + Number(i.qty || 0), 0),
    cartValue: Number(cart?.pricing?.grandTotal || cart?.pricing?.productSubtotal || 0)
  };
}

const isZero = (r) => !(Number(r.cartValue || 0) > 0) && !(Number(r.cartItemCount || 0) > 0);

// 1. backfill
let backfilled = 0;
const backfillLog = [];
for (const r of all) {
  if (!isZero(r) || !r.checkoutSessionId) continue;
  const snap = summarize(sessions.get(r.checkoutSessionId)?.cart);
  if (snap.cartItemCount > 0 && snap.cartValue > 0) {
    backfillLog.push(`${r.id} ${r.stage} -> ${snap.cartItemCount} item(s) ₹${snap.cartValue}`);
    if (apply) Object.assign(r, snap);
    backfilled += 1;
  }
}

// 2. archive logged-in instant-empty junk
const isLoggedInJunk = (r) =>
  r.stage === "expired" &&
  isZero(r) &&
  !!r.userId &&
  !r.checkoutSessionId &&
  !r.paymentAttemptId &&
  !r.recoveredOrderId &&
  !(Number(r.reminderCount || 0) > 0) &&
  r.createdAt && r.createdAt === r.lastActivityAt;
const junk = all.filter(isLoggedInJunk);
const keep = all.filter((r) => !isLoggedInJunk(r));

console.log(`records: ${all.length}`);
console.log(`backfill from checkout session: ${backfilled}`);
backfillLog.forEach((l) => console.log("  " + l));
console.log(`archive (logged-in, created empty, never used): ${junk.length}  keep: ${keep.length}`);
console.log(`zero-value records left after repair: ${keep.filter(isZero).length - (apply ? 0 : backfilled)}`);

if (!apply) {
  console.log("dry run - nothing written (pass --apply)");
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 10);
const archivePath = path.join(dir, `recovery-store.archive-${stamp}-b.json`);
if (fs.existsSync(archivePath)) {
  console.error(`archive already exists: ${archivePath} - refusing to overwrite`);
  process.exit(1);
}
fs.writeFileSync(archivePath, JSON.stringify({ archivedAt: new Date().toISOString(), reason: "logged-in empty carts created+expired instantly", recoveries: junk }), "utf8");
if (JSON.parse(fs.readFileSync(archivePath, "utf8")).recoveries.length !== junk.length) {
  console.error("archive verification failed - store NOT modified");
  process.exit(1);
}
store.recoveries = keep;
const tmp = storePath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
fs.renameSync(tmp, storePath);
console.log(`written. archive -> ${archivePath}`);
