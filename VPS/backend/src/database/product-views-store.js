const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

// Per-product, per-day page-view COUNTERS for the admin dashboard.
//
// Written after the Sep 2026 recovery-store incident (32 MB file re-parsed on
// every page view → pm2 memory restarts), so by design:
// - one small counter per product per day ({ v: views, u: unique visitors }),
//   never one record per view;
// - counts are kept in memory and flushed to disk at most every 30 s — a page
//   view never reads or writes the file;
// - only the last RETENTION_DAYS days are kept (pruned on flush).
// Shape: { days: { "YYYY-MM-DD" (IST): { [productId]: { v, u } } } }
//
// A pm2 restart can lose up to ~30 s of counts. Fine for analytics.

const storePath = path.resolve(process.cwd(), env.productViewsStorePath);
const RETENTION_DAYS = 400;
const FLUSH_INTERVAL_MS = 30 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;

let data = null;
let loading = null;
let dirty = false;
let writeQueue = Promise.resolve();

function istDayKey(ms = Date.now()) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

async function load() {
  if (data) return data;
  if (!loading) {
    loading = (async () => {
      try {
        const parsed = JSON.parse(await fs.readFile(storePath, "utf-8"));
        data = parsed && typeof parsed.days === "object" && parsed.days ? parsed : { days: {} };
      } catch (_error) {
        // Missing or unreadable file: start empty rather than break product pages.
        data = { days: {} };
      }
      return data;
    })();
  }
  return loading;
}

function prune() {
  const cutoff = istDayKey(Date.now() - RETENTION_DAYS * DAY_MS);
  for (const day of Object.keys(data.days)) {
    if (day < cutoff) delete data.days[day];
  }
}

async function flush() {
  if (!data || !dirty) return;
  dirty = false;
  prune();
  const snapshot = JSON.stringify(data);
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(path.dirname(storePath), { recursive: true });
      const tmpPath = storePath + ".tmp";
      await fs.writeFile(tmpPath, snapshot, "utf-8");
      await fs.rename(tmpPath, storePath);
    })
    .catch(() => {
      dirty = true; // retry on the next interval
    });
  return writeQueue;
}

const flushTimer = setInterval(() => { flush(); }, FLUSH_INTERVAL_MS);
if (typeof flushTimer.unref === "function") flushTimer.unref();

async function incrementProductView(productId, isNewVisitor) {
  if (!productId) return;
  await load();
  const day = istDayKey();
  const bucket = data.days[day] || (data.days[day] = {});
  const row = bucket[productId] || (bucket[productId] = { v: 0, u: 0 });
  row.v += 1;
  if (isNewVisitor) row.u += 1;
  dirty = true;
}

// Sums views per product over IST days [fromDay, toDay] inclusive.
async function sumProductViews(fromDay, toDay) {
  await load();
  const totals = new Map();
  for (const [day, bucket] of Object.entries(data.days)) {
    if (day < fromDay || day > toDay) continue;
    for (const [productId, row] of Object.entries(bucket)) {
      const t = totals.get(productId) || { views: 0, visitors: 0 };
      t.views += Number(row.v || 0);
      t.visitors += Number(row.u || 0);
      totals.set(productId, t);
    }
  }
  return totals;
}

async function getTrackingStartDay() {
  await load();
  const days = Object.keys(data.days).sort();
  return days[0] || null;
}

module.exports = {
  istDayKey,
  incrementProductView,
  sumProductViews,
  getTrackingStartDay,
  flushProductViews: flush
};
