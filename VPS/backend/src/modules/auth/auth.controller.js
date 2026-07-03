const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./auth.service");
const {
  parseAdminLoginPayload,
  parseRefreshPayload,
  parseCustomerRegisterEmailPayload,
  parseCustomerLoginEmailPayload,
  parseCustomerForgotPasswordPayload,
  parseCustomerResetPasswordPayload,
  parseCustomerGoogleLoginPayload,
  parseOtpRequestPayload,
  parseOtpVerifyPayload,
  parseCustomerLinkIdentityPayload,
  parseGuestCartAddItemPayload,
  parsePublicSearchQuery
} = require("./auth.validator");
const { ACTOR_TYPES } = require("./auth.model");

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

const adminLogin = asyncHandler(async (req, res) => {
  const payload = parseAdminLoginPayload(req.body);
  const data = await service.adminLogin(payload);
  return ok(res, data, "Admin login successful.");
});

const adminRefresh = asyncHandler(async (req, res) => {
  const payload = parseRefreshPayload(req.body);
  const data = await service.refreshSession(payload.refreshToken, ACTOR_TYPES.ADMIN);
  return ok(res, data, "Admin session refreshed.");
});

const adminLogout = asyncHandler(async (req, res) => {
  const payload = parseRefreshPayload(req.body);
  const data = await service.revokeSession(payload.refreshToken, ACTOR_TYPES.ADMIN);
  return ok(res, data, "Admin session revoked.");
});

const adminMe = asyncHandler(async (req, res) => {
  const data = await service.adminMe(req.actor.id);
  return ok(res, data, "Admin profile fetched.");
});

const customerRegisterEmail = asyncHandler(async (req, res) => {
  const payload = parseCustomerRegisterEmailPayload(req.body);
  const data = await service.customerRegisterEmail(payload);
  return created(res, data, "Customer registered.");
});

const customerLoginEmail = asyncHandler(async (req, res) => {
  const payload = parseCustomerLoginEmailPayload(req.body);
  const data = await service.customerLoginEmail(payload);
  return ok(res, data, "Customer login successful.");
});

const customerForgotPassword = asyncHandler(async (req, res) => {
  const payload = parseCustomerForgotPasswordPayload(req.body);
  const data = await service.customerForgotPassword(payload);
  return ok(
    res,
    data,
    "If the email exists, password reset instructions have been prepared."
  );
});

const customerResetPassword = asyncHandler(async (req, res) => {
  const payload = parseCustomerResetPasswordPayload(req.body);
  const data = await service.customerResetPassword(payload);
  return ok(res, data, "Customer password reset successful.");
});

const customerLoginGoogle = asyncHandler(async (req, res) => {
  const payload = parseCustomerGoogleLoginPayload(req.body);
  const data = await service.customerLoginGoogle(payload);
  return ok(res, data, "Google login successful.");
});

const customerRequestOtp = asyncHandler(async (req, res) => {
  const payload = parseOtpRequestPayload(req.body);
  const data = await service.requestOtp(payload);
  return ok(res, data, "OTP sent.");
});

const customerVerifyOtp = asyncHandler(async (req, res) => {
  const payload = parseOtpVerifyPayload(req.body);
  const data = await service.verifyOtp(payload);
  return ok(res, data, "OTP verified and login successful.");
});

const customerRefresh = asyncHandler(async (req, res) => {
  const payload = parseRefreshPayload(req.body);
  const data = await service.refreshSession(payload.refreshToken, ACTOR_TYPES.CUSTOMER);
  return ok(res, data, "Customer session refreshed.");
});

const customerLogout = asyncHandler(async (req, res) => {
  const payload = parseRefreshPayload(req.body);
  const data = await service.revokeSession(payload.refreshToken, ACTOR_TYPES.CUSTOMER);
  return ok(res, data, "Customer session revoked.");
});

const customerMe = asyncHandler(async (req, res) => {
  const data = await service.getCustomerProfile(req.customer.id);
  return ok(res, data, "Customer profile fetched.");
});

const customerLinkIdentity = asyncHandler(async (req, res) => {
  const payload = parseCustomerLinkIdentityPayload(req.body);
  const data = await service.linkCustomerIdentity(req.customer.id, payload);
  return ok(res, data, "Customer identity linked.");
});

const publicGoogleConfig = asyncHandler(async (_req, res) => {
  const data = await service.getGoogleOAuthPublicConfig();
  return ok(res, data, "Google OAuth configuration.");
});

const customerGoogleExchange = asyncHandler(async (req, res) => {
  const { code, redirectUri, guestSessionId } = req.body || {};
  if (!code || !redirectUri) {
    throw new HttpError(400, "code and redirectUri are required.");
  }
  const data = await service.customerGoogleExchange({ code, redirectUri, guestSessionId: guestSessionId || null });
  return ok(res, data, "Google login successful.");
});

const publicBrowseHealth = asyncHandler(async (_req, res) => {
  const data = service.publicBrowseHealth();
  return ok(res, data, "Guest browse available.");
});

const publicSearch = asyncHandler(async (req, res) => {
  const query = parsePublicSearchQuery(req.query || {});
  const data = service.publicSearch(query.q);
  return ok(res, data, "Public search response ready.");
});

const guestCartAddItem = asyncHandler(async (req, res) => {
  const payload = parseGuestCartAddItemPayload(req.body);
  const data = await service.addGuestCartItem(payload);
  return created(res, data, "Guest cart item added.");
});

const guestCartView = asyncHandler(async (req, res) => {
  const data = await service.getGuestCart(req.params.sessionId);
  return ok(res, data, "Guest cart fetched.");
});

const customerCartView = asyncHandler(async (req, res) => {
  const data = await service.getCustomerCart(req.customer.id);
  return ok(res, data, "Customer cart fetched.");
});

module.exports = {
  adminLogin,
  adminRefresh,
  adminLogout,
  adminMe,
  customerRegisterEmail,
  customerLoginEmail,
  customerForgotPassword,
  customerResetPassword,
  customerLoginGoogle,
  customerGoogleExchange,
  customerRequestOtp,
  customerVerifyOtp,
  customerRefresh,
  customerLogout,
  customerMe,
  customerLinkIdentity,
  publicGoogleConfig,
  publicBrowseHealth,
  publicSearch,
  guestCartAddItem,
  guestCartView,
  customerCartView
};
