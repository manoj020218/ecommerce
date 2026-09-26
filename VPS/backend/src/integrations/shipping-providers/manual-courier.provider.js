const {
  ShippingProviderAdapter
} = require("./shipping-provider.adapter");
const {
  calculateShippingQuote
} = require("../../modules/shipping/shipping-calculator");
const { fillTrackingPlaceholders } = require("../../database/legacy-tracking-urls");

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

    // Only filled {trackingId}; templates using {awb} leaked a literal "{awb}":
    // const trackingUrl = trackingUrlTemplate
    //   ? trackingUrlTemplate
    //       .replaceAll("{{trackingId}}", encodeURIComponent(trackingId))
    //       .replaceAll("{trackingId}", encodeURIComponent(trackingId))
    //   : "";
    const trackingUrl = trackingUrlTemplate
      ? fillTrackingPlaceholders(trackingUrlTemplate, trackingId)
      : "";

    return {
      trackingId,
      trackingUrl
    };
  }
}

module.exports = { ManualCourierProvider };
