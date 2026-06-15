const {
  getAllIntegrations,
  updateIntegration,
  getCustomCouriers,
  addCustomCourier,
  updateCustomCourier,
  deleteCustomCourier,
  probeTracking,
  fetchCourierTracking
} = require("./integrations.service");

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

async function adminListCouriers(req, res) {
  const couriers = await getCustomCouriers();
  res.json({ couriers });
}

async function adminAddCourier(req, res) {
  const adminEmail = req.actor?.email;
  const courier = await addCustomCourier(req.body, adminEmail);
  res.status(201).json(courier);
}

async function adminUpdateCourier(req, res) {
  const { id } = req.params;
  const adminEmail = req.actor?.email;
  const courier = await updateCustomCourier(id, req.body, adminEmail);
  res.json(courier);
}

async function adminDeleteCourier(req, res) {
  const { id } = req.params;
  const adminEmail = req.actor?.email;
  await deleteCustomCourier(id, adminEmail);
  res.json({ success: true });
}

// Test a tracking API URL without saving — used from the Add/Edit modal
async function adminProbeTracking(req, res) {
  const { trackingApiUrl, trackingId, apiHeaders } = req.body;
  const result = await probeTracking({ trackingApiUrl, trackingId, apiHeaders });
  res.json(result);
}

// Fetch live tracking for a saved courier by ID
async function adminGetCourierTracking(req, res) {
  const { id } = req.params;
  const { trackingId } = req.query;
  if (!trackingId) {
    return res.status(400).json({ success: false, message: "trackingId query param is required." });
  }
  const result = await fetchCourierTracking(id, trackingId);
  res.json(result);
}

module.exports = {
  adminGetIntegrations,
  adminUpdateIntegration,
  adminListCouriers,
  adminAddCourier,
  adminUpdateCourier,
  adminDeleteCourier,
  adminProbeTracking,
  adminGetCourierTracking
};
