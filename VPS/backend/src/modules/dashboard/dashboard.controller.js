const { getDashboardStats } = require("./dashboard.service");
const { getOrderTrend } = require("./order-trend.service");
const { getProductPerformance } = require("./product-views.service");

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

const adminGetDashboard = asyncHandler(async (req, res) => {
  const stats = await getDashboardStats();
  res.json({ ok: true, data: stats });
});

// ?range=week|month|year (anything else → week)
const adminGetOrderTrend = asyncHandler(async (req, res) => {
  const data = await getOrderTrend(String(req.query.range || "week"));
  res.json({ ok: true, data });
});

// ?range=7d|30d|90d|365d (anything else → 30d), ?limit=1..200
const adminGetProductPerformance = asyncHandler(async (req, res) => {
  const data = await getProductPerformance(String(req.query.range || "30d"), req.query.limit);
  res.json({ ok: true, data });
});

module.exports = { adminGetDashboard, adminGetOrderTrend, adminGetProductPerformance };
