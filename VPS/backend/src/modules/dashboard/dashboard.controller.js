const { getDashboardStats } = require("./dashboard.service");

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

module.exports = { adminGetDashboard };
