const { getDashboardStats } = require("./dashboard.service");

async function adminGetDashboard(req, res) {
  const stats = getDashboardStats();
  res.json({ ok: true, data: stats });
}

module.exports = { adminGetDashboard };
