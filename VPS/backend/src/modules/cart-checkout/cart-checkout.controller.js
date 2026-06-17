const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./cart-checkout.service");
const {
  parseGetCartQuery,
  parseAddItemPayload,
  parseUpdateItemPayload,
  parseDeleteItemQuery,
  parseMergeGuestPayload,
  parseShareCartPayload,
  parseClaimSharedCartPayload,
  parseCheckoutStartPayload,
  parseCheckoutViewQuery,
  parseCreatePaymentAttemptPayload,
  parsePaymentWebhookPayload
} = require("./cart-checkout.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", { issues: error.issues });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(mapValidationError(error));
    }
  };
}

function cartContext(req, sessionId = null) {
  return {
    customerId: req.customer?.id || null,
    sessionId: sessionId || null
  };
}

const getCart = asyncHandler(async (req, res) => {
  const query = parseGetCartQuery(req.query || {});
  const data = await service.getCart(cartContext(req, query.sessionId), query);
  return ok(res, data, "Cart fetched.");
});

const addCartItem = asyncHandler(async (req, res) => {
  const payload = parseAddItemPayload(req.body);
  const data = await service.addCartItem(cartContext(req, payload.sessionId), payload);
  return created(res, data, "Cart item added.");
});

const updateCartItem = asyncHandler(async (req, res) => {
  const payload = parseUpdateItemPayload(req.body);
  const data = await service.updateCartItem(
    cartContext(req, payload.sessionId),
    req.params.productId,
    payload
  );
  return ok(res, data, "Cart item updated.");
});

const deleteCartItem = asyncHandler(async (req, res) => {
  const query = parseDeleteItemQuery(req.query || {});
  const data = await service.deleteCartItem(
    cartContext(req, query.sessionId),
    req.params.productId,
    query
  );
  return ok(res, data, "Cart item removed.");
});

const mergeGuestCart = asyncHandler(async (req, res) => {
  const payload = parseMergeGuestPayload(req.body);
  const data = await service.mergeGuestCartIntoCustomer(
    req.customer.id,
    payload.guestSessionId
  );
  return ok(res, data, "Guest cart merged into customer cart.");
});

const shareCart = asyncHandler(async (req, res) => {
  const payload = parseShareCartPayload(req.body);
  const data = await service.createCartShare(cartContext(req, payload.sessionId), payload);
  return created(res, data, "Cart share link created.");
});

const getSharedCart = asyncHandler(async (req, res) => {
  const data = await service.getSharedCart(req.params.shareToken);
  return ok(res, data, "Shared cart fetched.");
});

const claimSharedCart = asyncHandler(async (req, res) => {
  const payload = parseClaimSharedCartPayload(req.body);
  const data = await service.claimSharedCart(
    cartContext(req, payload.targetSessionId),
    req.params.shareToken,
    payload
  );
  return ok(res, data, "Shared cart claimed.");
});

const checkoutStart = asyncHandler(async (req, res) => {
  const payload = parseCheckoutStartPayload(req.body);
  const data = await service.startCheckout(cartContext(req, payload.sessionId), payload);
  return ok(res, data, "Checkout start processed.");
});

const checkoutGetSession = asyncHandler(async (req, res) => {
  const query = parseCheckoutViewQuery(req.query || {});
  const data = await service.getCheckoutSession(
    cartContext(req, query.sessionId),
    req.params.checkoutSessionId,
    query
  );
  return ok(res, data, "Checkout session fetched.");
});

const checkoutGetFollowup = asyncHandler(async (req, res) => {
  const query = parseCheckoutViewQuery(req.query || {});
  const data = await service.getCheckoutFollowup(
    cartContext(req, query.sessionId),
    req.params.checkoutSessionId,
    query
  );
  return ok(res, data, "Checkout follow-up fetched.");
});

const checkoutDownloadInvoice = asyncHandler(async (req, res) => {
  const query = parseCheckoutViewQuery(req.query || {});
  const data = await service.downloadCheckoutInvoice(
    cartContext(req, query.sessionId),
    req.params.checkoutSessionId,
    query
  );
  return ok(res, data, "Checkout invoice download prepared.");
});

const paymentsCreateAttempt = asyncHandler(async (req, res) => {
  const payload = parseCreatePaymentAttemptPayload(req.body);
  const data = await service.createPaymentAttempt(
    cartContext(req, payload.sessionId),
    payload
  );
  return created(res, data, "Payment attempt created.");
});

const paymentsWebhookMock = asyncHandler(async (req, res) => {
  const payload = parsePaymentWebhookPayload(req.body);
  const data = await service.processMockPaymentWebhook(payload);
  return ok(res, data, "Mock payment webhook processed.");
});

const paymentsWebhookGateway = asyncHandler(async (req, res) => {
  const payload = parsePaymentWebhookPayload(req.body);
  const data = await service.processPaymentWebhook(req.params.gateway, payload);
  return ok(res, data, "Payment webhook processed.");
});

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  deleteCartItem,
  mergeGuestCart,
  shareCart,
  getSharedCart,
  claimSharedCart,
  checkoutStart,
  checkoutGetSession,
  checkoutGetFollowup,
  checkoutDownloadInvoice,
  paymentsCreateAttempt,
  paymentsWebhookMock,
  paymentsWebhookGateway
};
