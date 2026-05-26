class ShippingProviderAdapter {
  async calculateShipping() {
    throw new Error("TODO: implement calculateShipping in provider adapter.");
  }

  async createShipment() {
    throw new Error("TODO: implement createShipment in provider adapter.");
  }
}

function createShippingProvider(providerName) {
  const normalized = String(providerName || "manual_courier").trim().toLowerCase();

  if (normalized === "manual_courier") {
    const {
      ManualCourierProvider
    } = require("./manual-courier.provider");
    return new ManualCourierProvider();
  }

  throw new Error(`Shipping provider '${providerName}' is not implemented yet.`);
}

module.exports = { ShippingProviderAdapter, createShippingProvider };
