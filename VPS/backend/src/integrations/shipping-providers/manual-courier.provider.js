const {
  ShippingProviderAdapter
} = require("./shipping-provider.adapter");
const {
  calculateShippingQuote
} = require("../../modules/shipping/shipping-calculator");

class ManualCourierProvider extends ShippingProviderAdapter {
  async calculateShipping(input) {
    return calculateShippingQuote({
      lines: input.lines || [],
      shippingMethod: input.shippingMethod,
      destination: input.destination || {},
      shippingStore: input.shippingStore || {}
    });
  }

  async createShipment(input) {
    const trackingId = String(input.trackingId || "").trim();
    const trackingUrlTemplate = String(input.trackingUrlTemplate || "").trim();

    const trackingUrl = trackingUrlTemplate
      ? trackingUrlTemplate
          .replaceAll("{{trackingId}}", encodeURIComponent(trackingId))
          .replaceAll("{trackingId}", encodeURIComponent(trackingId))
      : "";

    return {
      trackingId,
      trackingUrl
    };
  }
}

module.exports = { ManualCourierProvider };
