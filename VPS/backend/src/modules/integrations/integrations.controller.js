const { getAllIntegrations, updateIntegration } = require("./integrations.service");

async function adminGetIntegrations(req, res) {
  const data = await getAllIntegrations();
  res.json(data);
}

async function adminUpdateIntegration(req, res) {
  const { code } = req.params;
  const adminEmail = req.actor?.email;
  const updated = await updateIntegration(code, req.body, adminEmail);
  res.json(updated);
}

module.exports = { adminGetIntegrations, adminUpdateIntegration };
