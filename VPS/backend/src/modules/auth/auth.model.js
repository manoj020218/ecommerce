const ACTOR_TYPES = Object.freeze({
  ADMIN: "admin",
  CUSTOMER: "customer"
});

const CUSTOMER_AUTH_PROVIDERS = Object.freeze({
  EMAIL_PASSWORD: "email_password",
  GOOGLE: "google",
  OTP_MOBILE: "otp_mobile"
});

function sanitizeCustomerUser(user) {
  const { passwordHash, ...safe } = user;
  void passwordHash;
  return safe;
}

module.exports = { ACTOR_TYPES, CUSTOMER_AUTH_PROVIDERS, sanitizeCustomerUser };
