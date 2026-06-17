const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(120)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const customerRegisterEmailSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(150),
  password: z.string().min(8).max(120),
  mobile: z.string().trim().max(20).optional(),
  guestSessionId: z.string().trim().max(120).optional()
});

const customerLoginEmailSchema = z.object({
  email: z.string().trim().email().max(150),
  password: z.string().min(8).max(120),
  guestSessionId: z.string().trim().max(120).optional()
});

const customerForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(150)
});

const customerResetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(250),
  password: z.string().min(8).max(120)
});

const customerGoogleLoginSchema = z.object({
  googleSub: z.string().trim().min(3).max(250),
  email: z.string().trim().email().max(150),
  name: z.string().trim().min(2).max(120),
  mobile: z.string().trim().max(20).optional(),
  guestSessionId: z.string().trim().max(120).optional()
});

const otpRequestSchema = z.object({
  mobile: z.string().trim().min(8).max(20)
});

const otpVerifySchema = z.object({
  mobile: z.string().trim().min(8).max(20),
  code: z.string().trim().min(4).max(12),
  name: z.string().trim().min(2).max(120).optional(),
  guestSessionId: z.string().trim().max(120).optional()
});

const customerLinkIdentitySchema = z.object({
  email: z.string().trim().email().max(150).optional(),
  mobile: z.string().trim().max(20).optional(),
  verifiedEmail: z.boolean().optional(),
  verifiedMobile: z.boolean().optional()
});

const guestCartAddItemSchema = z.object({
  sessionId: z.string().trim().min(3).max(120),
  productId: z.string().trim().min(2).max(120),
  qty: z.coerce.number().int().min(1).max(1000)
});

const publicSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default("")
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseAdminLoginPayload(payload) {
  ensureObject(payload, "Admin login");
  return adminLoginSchema.parse(payload);
}

function parseRefreshPayload(payload) {
  ensureObject(payload, "Refresh token");
  return refreshSchema.parse(payload);
}

function parseCustomerRegisterEmailPayload(payload) {
  ensureObject(payload, "Customer register");
  return customerRegisterEmailSchema.parse(payload);
}

function parseCustomerLoginEmailPayload(payload) {
  ensureObject(payload, "Customer login");
  return customerLoginEmailSchema.parse(payload);
}

function parseCustomerForgotPasswordPayload(payload) {
  ensureObject(payload, "Customer forgot password");
  return customerForgotPasswordSchema.parse(payload);
}

function parseCustomerResetPasswordPayload(payload) {
  ensureObject(payload, "Customer reset password");
  return customerResetPasswordSchema.parse(payload);
}

function parseCustomerGoogleLoginPayload(payload) {
  ensureObject(payload, "Google login");
  return customerGoogleLoginSchema.parse(payload);
}

function parseOtpRequestPayload(payload) {
  ensureObject(payload, "OTP request");
  return otpRequestSchema.parse(payload);
}

function parseOtpVerifyPayload(payload) {
  ensureObject(payload, "OTP verify");
  return otpVerifySchema.parse(payload);
}

function parseCustomerLinkIdentityPayload(payload) {
  ensureObject(payload, "Link identity");
  return customerLinkIdentitySchema.parse(payload);
}

function parseGuestCartAddItemPayload(payload) {
  ensureObject(payload, "Guest cart item");
  return guestCartAddItemSchema.parse(payload);
}

function parsePublicSearchQuery(query) {
  return publicSearchQuerySchema.parse(query || {});
}

module.exports = {
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
};
