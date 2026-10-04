const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

// Per-project, per-day page-view COUNTERS for Admin → Projects (2026-10-04).
// Same design as product-views-store.js (kept separate so neither can break
// the other):
// - one small counter per project per day ({ v: views, u: unique visitors });
// - counts live in memory and are flushed to disk at most every 30 s — a page
//   view never reads or writes the file;
// - only the last RETENTION_DAYS days are kept (pruned on flush).
// Shape: { days: { "YYYY-MM-DD" (IST): { [projectId]: { v, u } } } }
// A pm2 restart can lose up to ~30 s of counts. Fine for analytics.

const storePath = path.resolve(process.cwd(), env.projectViewsStorePath);
const RETENTION_DAYS = 800;
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
        // Missing or unreadable file: start empty rather than break project pages.
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

async function incrementProjectView(projectId, isNewVisitor) {
  if (!projectId) return;
  await load();
  const day = istDayKey();
  const bucket = data.days[day] || (data.days[day] = {});
  const row = bucket[projectId] || (bucket[projectId] = { v: 0, u: 0 });
  row.v += 1;
  if (isNewVisitor) row.u += 1;
  dirty = true;
}

// Sums views per project over IST days [fromDay, toDay] inclusive.
async function sumProjectViews(fromDay, toDay) {
  await load();
  const totals = new Map();
  for (const [day, bucket] of Object.entries(data.days)) {
    if (day < fromDay || day > toDay) continue;
    for (const [projectId, row] of Object.entries(bucket)) {
      const t = totals.get(projectId) || { views: 0, visitors: 0 };
      t.views += Number(row.v || 0);
      t.visitors += Number(row.u || 0);
      totals.set(projectId, t);
    }
  }
  return totals;
}

async function getProjectTrackingStartDay() {
  await load();
  const days = Object.keys(data.days).sort();
  return days[0] || null;
}

module.exports = {
  istDayKey,
  incrementProjectView,
  sumProjectViews,
  getProjectTrackingStartDay,
  flushProjectViews: flush
};
