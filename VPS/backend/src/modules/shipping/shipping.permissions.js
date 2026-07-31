const SHIPPING_PERMISSIONS = Object.freeze({
  VIEW: "shipping.view",
  CREATE: "shipping.create",
  // Rate cards / courier profiles / shipping classes / shipping settings used to
  // share CREATE with plain shipment creation, so anyone who could pack an order
  // could also silently edit courier config. Kept separate so an order-processing
  // role can create shipments without also managing shipping configuration.
  MANAGE_CONFIG: "shipping.manage_config",
  UPDATE_TRACKING: "shipping.update_tracking",
  MARK_DELIVERED: "shipping.mark_delivered",
  UPLOAD_POD: "shipping.upload_pod"
});

module.exports = { SHIPPING_PERMISSIONS };
