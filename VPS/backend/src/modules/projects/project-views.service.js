const crypto = require("node:crypto");
const {
  istDayKey,
  incrementProjectView,
  sumProjectViews,
  getProjectTrackingStartDay
} = require("../../database/project-views-store");

// Project page visit counting for Admin → Projects (2026-10-04). The
// storefront project page calls GET /api/projects/:slug once per view.

const DAY_MS = 86400000;

// Same bot filter as the product page counter (dashboard/product-views.service.js).
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp/i;

// Approximate unique visitors: hash(ip + user-agent) per project per IST day,
// in memory only (reset each day and on restart).
let seenDay = "";
let seen = new Set();

function isBot(userAgent) {
  const ua = String(userAgent || "");
  return !ua || BOT_UA.test(ua);
}

// Never throws and never waits on disk, so it cannot slow down or break a page.
function recordProjectView(projectId, req) {
  try {
    const ua = req?.headers?.["user-agent"] || "";
    if (!projectId || isBot(ua)) return;
    const today = istDayKey();
    if (today !== seenDay) {
      seenDay = today;
      seen = new Set();
    }
    const key = crypto
      .createHash("sha1")
      .update(`${projectId}|${req.ip || ""}|${ua}`)
      .digest("base64");
    const isNewVisitor = !seen.has(key);
    if (isNewVisitor) seen.add(key);
    incrementProjectView(projectId, isNewVisitor).catch(() => {});
  } catch (_error) {
    // analytics must never affect the storefront
  }
}

// Per project: views today / last 7 days / last 30 days / since tracking
// started, unique visitors since tracking started, and enquiries received in
// that same period (so the conversion compares like with like).
async function getProjectVisitStats(enquiries = []) {
  const today = istDayKey();
  const from7 = istDayKey(Date.now() - 6 * DAY_MS);
  const from30 = istDayKey(Date.now() - 29 * DAY_MS);
  const [todayTotals, totals7, totals30, allTotals, trackingSince] = await Promise.all([
    sumProjectViews(today, today),
    sumProjectViews(from7, today),
    sumProjectViews(from30, today),
    sumProjectViews("0000-00-00", today),
    getProjectTrackingStartDay()
  ]);

  const stats = new Map();
  const get = (id) => {
    if (!stats.has(id)) {
      stats.set(id, { today: 0, last7Days: 0, last30Days: 0, total: 0, visitors: 0, enquiriesSinceTracking: 0, conversionPct: null });
    }
    return stats.get(id);
  };
  for (const [id, t] of todayTotals) get(id).today = t.views;
  for (const [id, t] of totals7) get(id).last7Days = t.views;
  for (const [id, t] of totals30) get(id).last30Days = t.views;
  for (const [id, t] of allTotals) {
    const s = get(id);
    s.total = t.views;
    s.visitors = t.visitors;
  }
  if (trackingSince) {
    for (const e of Array.isArray(enquiries) ? enquiries : []) {
      if (!e.projectId || !e.createdAt) continue;
      if (istDayKey(Date.parse(e.createdAt)) < trackingSince) continue;
      get(e.projectId).enquiriesSinceTracking += 1;
    }
  }
  for (const s of stats.values()) {
    s.conversionPct = s.visitors > 0 ? Math.round((s.enquiriesSinceTracking / s.visitors) * 1000) / 10 : null;
  }
  return { trackingSince, stats };
}

module.exports = { recordProjectView, getProjectVisitStats };
