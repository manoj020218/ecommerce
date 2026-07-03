const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { HttpError } = require("../../common/http-error");
const { getGoogleOAuthPublicConfig, exchangeGoogleCodeForProfile } = require("./google-oauth.service");
const { env } = require("../../config/env");
const { generateId, hashValue } = require("../../common/identity");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require("../../common/token-service");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const {
  ensureDefaultGroups
} = require("../roles-permissions/roles-permissions.service");
const { AUDIT_LOG_ACTIONS } = require("../audit-logs/audit-logs.model");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  ACTOR_TYPES,
  CUSTOMER_AUTH_PROVIDERS,
  sanitizeCustomerUser
} = require("./auth.model");
const {
  ensureCustomerAccountShape
} = require("../customer-account/customer-account.model");
const {
  addGuestCartItemLegacy,
  getGuestCartLegacy,
  getCustomerCartLegacy
} = require("../cart-checkout/cart-checkout.service");
const { getAllSettings } = require("../settings/settings.service");
const { safeSendTemplateNotification } = require("../marketing/marketing.service");

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeMobile(mobile) {
  return mobile.trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePublicBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/$/, "");
  if (!trimmed) {
    return "";
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildPasswordResetToken() {
  return crypto.randomBytes(24).toString("hex");
}

function prunePasswordResetRequests(store) {
  const currentRows = ensureArray(store.passwordResetRequests);
  const nextRows = currentRows.filter(
    (request) =>
      !request.usedAt &&
      Date.parse(request.expiresAt || "") > Date.now()
  );
  store.passwordResetRequests = nextRows;
  return nextRows.length !== currentRows.length;
}

function buildAdminPermissions(store, staffUser) {
  if (staffUser.role === "super_admin") {
    return ["*"];
  }

  const group = store.permissionGroups.find(
    (item) => item.id === staffUser.permissionGroupId
  );
  if (!group) {
    throw new HttpError(403, "Staff permission group is missing.");
  }

  return group.permissions;
}

function createRefreshSessionRecord(base) {
  const nowTs = Date.now();
  const refreshToken = signRefreshToken({
    sub: base.actorId,
    actorType: base.actorType,
    sessionId: base.sessionId
  });

  const decoded = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  return {
    refreshToken,
    session: {
      id: base.sessionId,
      actorType: base.actorType,
      actorId: base.actorId,
      tokenHash: hashValue(refreshToken),
      createdAt: new Date(nowTs).toISOString(),
      expiresAt,
      revokedAt: null
    }
  };
}

function createAccessTokenForAdmin(staffUser, permissions) {
  return signAccessToken({
    sub: staffUser.id,
    actorType: ACTOR_TYPES.ADMIN,
    role: staffUser.role,
    email: staffUser.email,
    permissionGroupId: staffUser.permissionGroupId || null,
    permissions
  });
}

function createAccessTokenForCustomer(user) {
  return signAccessToken({
    sub: user.id,
    actorType: ACTOR_TYPES.CUSTOMER,
    email: user.email || null,
    mobile: user.mobile || null,
    verifiedEmail: Boolean(user.verifiedEmail),
    verifiedMobile: Boolean(user.verifiedMobile)
  });
}

function mergeGuestCartIntoUser(store, guestSessionId, userId) {
  if (!guestSessionId) {
    return false;
  }

  const guestIndex = store.guestCarts.findIndex(
    (cart) => cart.sessionId === guestSessionId
  );
  if (guestIndex < 0) {
    return false;
  }

  const guestCart = store.guestCarts[guestIndex];
  let userCart = store.userCarts.find((cart) => cart.userId === userId);
  if (!userCart) {
    userCart = { userId, items: [], updatedAt: new Date().toISOString() };
    store.userCarts.push(userCart);
  }

  for (const guestItem of ensureArray(guestCart.items)) {
    const existingItem = userCart.items.find(
      (item) => item.productId === guestItem.productId
    );
    if (existingItem) {
      existingItem.qty += guestItem.qty;
    } else {
      userCart.items.push({
        productId: guestItem.productId,
        qty: guestItem.qty
      });
    }
  }

  userCart.updatedAt = new Date().toISOString();
  store.guestCarts.splice(guestIndex, 1);
  return true;
}

function ensureCustomerHasProvider(user, providerType, providerId) {
  const providers = ensureArray(user.authProviders);
  const exists = providers.some(
    (provider) =>
      provider.providerType === providerType &&
      (providerId ? provider.providerId === providerId : true)
  );
  if (!exists) {
    providers.push({
      providerType,
      providerId: providerId || null,
      linkedAt: new Date().toISOString()
    });
  }
  user.authProviders = providers;
}

function revokeCustomerRefreshSessions(store, customerId) {
  const revokedAt = nowIso();

  for (const session of ensureArray(store.refreshSessions)) {
    if (
      session.actorType === ACTOR_TYPES.CUSTOMER &&
      session.actorId === customerId &&
      !session.revokedAt
    ) {
      session.revokedAt = revokedAt;
    }
  }
}

async function resolveStorefrontBaseUrl() {
  const settings = await getAllSettings();
  return normalizePublicBaseUrl(
    settings.seoDefaults?.canonicalDomain || env.publicBaseUrl
  );
}

function toPublicAdmin(staffUser, permissions) {
  return {
    id: staffUser.id,
    name: staffUser.name,
    email: staffUser.email,
    mobile: staffUser.mobile,
    role: staffUser.role,
    permissionGroupId: staffUser.permissionGroupId || null,
    permissions,
    isActive: Boolean(staffUser.isActive),
    lastLoginAt: staffUser.lastLoginAt || null
  };
}

async function ensureAuthBootstrap() {
  const store = await readAuthStore();
  let changed = false;

  if (!Array.isArray(store.staffUsers)) {
    store.staffUsers = [];
    changed = true;
  }
  if (!Array.isArray(store.users)) {
    store.users = [];
    changed = true;
  }
  if (!Array.isArray(store.refreshSessions)) {
    store.refreshSessions = [];
    changed = true;
  }
  if (!Array.isArray(store.otpChallenges)) {
    store.otpChallenges = [];
    changed = true;
  }
  if (!Array.isArray(store.passwordResetRequests)) {
    store.passwordResetRequests = [];
    changed = true;
  }
  if (!Array.isArray(store.guestCarts)) {
    store.guestCarts = [];
    changed = true;
  }
  if (!Array.isArray(store.userCarts)) {
    store.userCarts = [];
    changed = true;
  }
  if (!Array.isArray(store.cartShares)) {
    store.cartShares = [];
    changed = true;
  }
  if (!Array.isArray(store.stockReservations)) {
    store.stockReservations = [];
    changed = true;
  }
  if (!Array.isArray(store.checkoutSessions)) {
    store.checkoutSessions = [];
    changed = true;
  }
  if (!Array.isArray(store.paymentAttempts)) {
    store.paymentAttempts = [];
    changed = true;
  }
  if (!Array.isArray(store.quoteRequests)) {
    store.quoteRequests = [];
    changed = true;
  }
  if (!Array.isArray(store.orders)) {
    store.orders = [];
    changed = true;
  }

  const seededGroups = await ensureDefaultGroups(store);
  if (seededGroups) {
    changed = true;
  }

  const superAdmin = store.staffUsers.find((user) => user.role === "super_admin");
  if (!superAdmin) {
    changed = true;
    const now = new Date().toISOString();
    store.staffUsers.push({
      id: "staff_super_admin",
      role: "super_admin",
      name: "Super Admin",
      email: normalizeEmail(env.superAdminEmail),
      mobile: "",
      permissionGroupId: "group_super_admin",
      passwordHash: await bcrypt.hash(env.superAdminPassword, 10),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    });
  }

  const prunedPasswordResetRequests = prunePasswordResetRequests(store);

  if (changed || prunedPasswordResetRequests) {
    await writeAuthStore(store);
  }

  return store;
}

async function issueAdminTokens(store, staffUser) {
  const permissions = buildAdminPermissions(store, staffUser);
  const accessToken = createAccessTokenForAdmin(staffUser, permissions);
  const sessionId = generateId("sess_admin");
  const { refreshToken, session } = createRefreshSessionRecord({
    actorType: ACTOR_TYPES.ADMIN,
    actorId: staffUser.id,
    sessionId
  });

  store.refreshSessions.push(session);

  const staffIndex = store.staffUsers.findIndex((item) => item.id === staffUser.id);
  if (staffIndex >= 0) {
    store.staffUsers[staffIndex] = {
      ...store.staffUsers[staffIndex],
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  await writeAuthStore(store);

  return {
    accessToken,
    refreshToken,
    admin: toPublicAdmin(staffUser, permissions)
  };
}

async function issueCustomerTokens(store, customerUser, guestSessionId) {
  ensureCustomerAccountShape(customerUser);
  const mergedGuestCart = mergeGuestCartIntoUser(
    store,
    guestSessionId,
    customerUser.id
  );
  const accessToken = createAccessTokenForCustomer(customerUser);
  const sessionId = generateId("sess_customer");
  const { refreshToken, session } = createRefreshSessionRecord({
    actorType: ACTOR_TYPES.CUSTOMER,
    actorId: customerUser.id,
    sessionId
  });

  store.refreshSessions.push(session);
  customerUser.lastLoginAt = new Date().toISOString();
  customerUser.updatedAt = new Date().toISOString();

  await writeAuthStore(store);

  return {
    accessToken,
    refreshToken,
    customer: sanitizeCustomerUser(customerUser),
    mergedGuestCart
  };
}

async function adminLogin(payload) {
  const store = await ensureAuthBootstrap();
  const normalizedEmail = normalizeEmail(payload.email);

  const staffUser = store.staffUsers.find(
    (user) => normalizeEmail(user.email) === normalizedEmail
  );
  if (!staffUser) {
    await addActivityLog({
      action: AUDIT_LOG_ACTIONS.ADMIN_LOGIN_FAILED,
      actorId: "anonymous",
      actorRole: "anonymous",
      resourceType: "admin_auth",
      metadata: { reason: "invalid_email", email: normalizedEmail }
    });
    throw new HttpError(401, "Invalid admin credentials.");
  }

  const passwordOk = await bcrypt.compare(payload.password, staffUser.passwordHash);
  if (!passwordOk) {
    await addActivityLog({
      action: AUDIT_LOG_ACTIONS.ADMIN_LOGIN_FAILED,
      actorId: staffUser.id,
      actorRole: staffUser.role,
      resourceType: "admin_auth",
      metadata: { reason: "invalid_password" }
    });
    throw new HttpError(401, "Invalid admin credentials.");
  }

  if (!staffUser.isActive) {
    throw new HttpError(403, "Staff account is disabled.");
  }

  const session = await issueAdminTokens(store, staffUser);

  await addActivityLog({
    action: AUDIT_LOG_ACTIONS.ADMIN_LOGIN_SUCCESS,
    actorId: staffUser.id,
    actorRole: staffUser.role,
    resourceType: "admin_auth",
    resourceId: staffUser.id
  });

  return session;
}

async function refreshSession(refreshToken, expectedActorType) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (_error) {
    throw new HttpError(401, "Invalid refresh token.");
  }

  if (decoded.actorType !== expectedActorType) {
    throw new HttpError(403, "Refresh token actor type mismatch.");
  }

  const store = await ensureAuthBootstrap();
  const sessionIndex = store.refreshSessions.findIndex(
    (session) => session.id === decoded.sessionId
  );
  if (sessionIndex < 0) {
    throw new HttpError(401, "Refresh session not found.");
  }

  const session = store.refreshSessions[sessionIndex];
  if (session.revokedAt) {
    throw new HttpError(401, "Refresh session already revoked.");
  }

  if (session.tokenHash !== hashValue(refreshToken)) {
    throw new HttpError(401, "Refresh token mismatch.");
  }

  if (Date.parse(session.expiresAt) < Date.now()) {
    throw new HttpError(401, "Refresh session expired.");
  }

  session.revokedAt = new Date().toISOString();

  if (expectedActorType === ACTOR_TYPES.ADMIN) {
    const staffUser = store.staffUsers.find((user) => user.id === decoded.sub);
    if (!staffUser || !staffUser.isActive) {
      throw new HttpError(401, "Admin session is no longer valid.");
    }

    return issueAdminTokens(store, staffUser);
  }

  const customerUser = store.users.find((user) => user.id === decoded.sub);
  if (!customerUser) {
    throw new HttpError(401, "Customer session is no longer valid.");
  }

  return issueCustomerTokens(store, customerUser);
}

async function revokeSession(refreshToken, expectedActorType) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (_error) {
    throw new HttpError(401, "Invalid refresh token.");
  }

  if (decoded.actorType !== expectedActorType) {
    throw new HttpError(403, "Refresh token actor type mismatch.");
  }

  const store = await ensureAuthBootstrap();
  const session = store.refreshSessions.find((item) => item.id === decoded.sessionId);
  if (!session) {
    return { revoked: false };
  }

  session.revokedAt = new Date().toISOString();
  await writeAuthStore(store);
  return { revoked: true };
}

async function customerRegisterEmail(payload) {
  const store = await ensureAuthBootstrap();
  const normalizedEmail = normalizeEmail(payload.email);

  const duplicate = store.users.find(
    (user) => user.email && normalizeEmail(user.email) === normalizedEmail
  );
  if (duplicate) {
    throw new HttpError(409, "Customer email already exists.");
  }

  const now = new Date().toISOString();
  const user = {
    id: generateId("user"),
    name: payload.name,
    email: normalizedEmail,
    mobile: payload.mobile ? normalizeMobile(payload.mobile) : "",
    company: payload.company ? String(payload.company).trim() : "",
    gstin: payload.gstin ? String(payload.gstin).trim().toUpperCase() : "",
    verifiedEmail: false,
    verifiedMobile: false,
    passwordHash: await bcrypt.hash(payload.password, 10),
    authProviders: [
      {
        providerType: CUSTOMER_AUTH_PROVIDERS.EMAIL_PASSWORD,
        providerId: normalizedEmail,
        linkedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };

  store.users.push(user);
  return issueCustomerTokens(store, user, payload.guestSessionId);
}

async function customerLoginEmail(payload) {
  const store = await ensureAuthBootstrap();
  const normalizedEmail = normalizeEmail(payload.email);
  const user = store.users.find(
    (item) => item.email && normalizeEmail(item.email) === normalizedEmail
  );

  if (!user || !user.passwordHash) {
    throw new HttpError(401, "Invalid customer credentials.");
  }

  const passwordOk = await bcrypt.compare(payload.password, user.passwordHash);
  if (!passwordOk) {
    throw new HttpError(401, "Invalid customer credentials.");
  }

  return issueCustomerTokens(store, user, payload.guestSessionId);
}

async function customerForgotPassword(payload) {
  const store = await ensureAuthBootstrap();
  const normalizedEmail = normalizeEmail(payload.email);
  const user = store.users.find(
    (item) => item.email && normalizeEmail(item.email) === normalizedEmail
  );

  if (!user) {
    return { accepted: true };
  }

  prunePasswordResetRequests(store);
  store.passwordResetRequests = store.passwordResetRequests.filter(
    (request) => request.userId !== user.id
  );

  const rawToken = buildPasswordResetToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const baseUrl = await resolveStorefrontBaseUrl();
  const resetUrl = `${baseUrl}/account/reset-password?token=${encodeURIComponent(rawToken)}`;

  store.passwordResetRequests.push({
    id: generateId("pwd_reset"),
    userId: user.id,
    email: normalizedEmail,
    tokenHash: hashValue(rawToken),
    createdAt,
    expiresAt,
    usedAt: null
  });
  await writeAuthStore(store);

  await safeSendTemplateNotification({
    templateKey: "forgot_password",
    toEmail: normalizedEmail,
    relatedResourceType: "customer_auth",
    relatedResourceId: user.id,
    variables: {
      customerName: user.name || "Customer",
      resetPasswordUrl: resetUrl
    }
  });

  await addActivityLog({
    action: "auth.customer.password_reset.requested",
    actorId: user.id,
    actorRole: "customer",
    resourceType: "customer_auth",
    resourceId: user.id,
    metadata: {
      email: normalizedEmail
    }
  });

  return {
    accepted: true,
    expiresAt,
    ...(env.nodeEnv === "production"
      ? {}
      : {
          devResetToken: rawToken,
          devResetUrl: resetUrl
        })
  };
}

async function customerResetPassword(payload) {
  const store = await ensureAuthBootstrap();
  prunePasswordResetRequests(store);

  const request = store.passwordResetRequests.find(
    (item) =>
      item.tokenHash === hashValue(payload.token) &&
      !item.usedAt &&
      Date.parse(item.expiresAt || "") > Date.now()
  );

  if (!request) {
    throw new HttpError(400, "Reset link is invalid or expired.");
  }

  const user = store.users.find((item) => item.id === request.userId);
  if (!user || !user.email) {
    throw new HttpError(400, "Reset link is invalid or expired.");
  }

  user.passwordHash = await bcrypt.hash(payload.password, 10);
  user.verifiedEmail = true;
  user.updatedAt = nowIso();
  ensureCustomerHasProvider(
    user,
    CUSTOMER_AUTH_PROVIDERS.EMAIL_PASSWORD,
    normalizeEmail(user.email)
  );

  request.usedAt = nowIso();
  revokeCustomerRefreshSessions(store, user.id);
  await writeAuthStore(store);

  await addActivityLog({
    action: "auth.customer.password_reset.completed",
    actorId: user.id,
    actorRole: "customer",
    resourceType: "customer_auth",
    resourceId: user.id
  });

  return {
    reset: true,
    customer: sanitizeCustomerUser(user)
  };
}

async function customerLoginGoogle(payload) {
  // TODO: verify google ID token with provider adapter once integration is added.
  const store = await ensureAuthBootstrap();
  const normalizedEmail = normalizeEmail(payload.email);

  let user = store.users.find((item) =>
    ensureArray(item.authProviders).some(
      (provider) =>
        provider.providerType === CUSTOMER_AUTH_PROVIDERS.GOOGLE &&
        provider.providerId === payload.googleSub
    )
  );

  if (!user) {
    user = store.users.find(
      (item) => item.email && normalizeEmail(item.email) === normalizedEmail
    );
  }

  const now = new Date().toISOString();
  if (!user) {
    user = {
      id: generateId("user"),
      name: payload.name,
      email: normalizedEmail,
      mobile: payload.mobile ? normalizeMobile(payload.mobile) : "",
      verifiedEmail: true,
      verifiedMobile: false,
      passwordHash: null,
      authProviders: [],
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };
    store.users.push(user);
  }

  user.name = user.name || payload.name;
  user.email = user.email || normalizedEmail;
  user.verifiedEmail = true;
  if (payload.mobile && !user.mobile) {
    user.mobile = normalizeMobile(payload.mobile);
  }
  ensureCustomerHasProvider(user, CUSTOMER_AUTH_PROVIDERS.GOOGLE, payload.googleSub);
  user.updatedAt = now;

  return issueCustomerTokens(store, user, payload.guestSessionId);
}

async function requestOtp(payload) {
  // TODO: replace with provider adapter when OTP provider is configured.
  const store = await ensureAuthBootstrap();
  const now = Date.now();
  const challengeCode =
    env.nodeEnv === "production"
      ? `${Math.floor(100000 + Math.random() * 900000)}`
      : env.otpDevDefaultCode;

  const mobile = normalizeMobile(payload.mobile);

  store.otpChallenges = store.otpChallenges.filter(
    (item) => !(item.mobile === mobile && !item.verifiedAt)
  );

  const challenge = {
    id: generateId("otp"),
    mobile,
    codeHash: hashValue(challengeCode),
    attempts: 0,
    maxAttempts: 5,
    expiresAt: new Date(now + 1000 * 60 * 10).toISOString(),
    verifiedAt: null,
    createdAt: new Date(now).toISOString()
  };
  store.otpChallenges.push(challenge);
  await writeAuthStore(store);

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    ...(env.nodeEnv === "production" ? {} : { devCode: challengeCode })
  };
}

async function verifyOtp(payload) {
  const store = await ensureAuthBootstrap();
  const mobile = normalizeMobile(payload.mobile);

  const challenge = [...store.otpChallenges]
    .reverse()
    .find((item) => item.mobile === mobile && !item.verifiedAt);

  if (!challenge) {
    throw new HttpError(401, "OTP challenge not found.");
  }

  if (Date.parse(challenge.expiresAt) < Date.now()) {
    throw new HttpError(401, "OTP challenge expired.");
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new HttpError(429, "OTP attempts exceeded.");
  }

  const codeMatched = challenge.codeHash === hashValue(payload.code);
  if (!codeMatched) {
    challenge.attempts += 1;
    await writeAuthStore(store);
    throw new HttpError(401, "Invalid OTP code.");
  }

  challenge.verifiedAt = new Date().toISOString();

  let user = store.users.find((item) => item.mobile === mobile);
  if (!user) {
    const now = new Date().toISOString();
    user = {
      id: generateId("user"),
      name: payload.name || "Customer",
      email: "",
      mobile,
      verifiedEmail: false,
      verifiedMobile: true,
      passwordHash: null,
      authProviders: [],
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };
    store.users.push(user);
  }

  user.mobile = mobile;
  user.verifiedMobile = true;
  ensureCustomerHasProvider(user, CUSTOMER_AUTH_PROVIDERS.OTP_MOBILE, mobile);
  user.updatedAt = new Date().toISOString();

  return issueCustomerTokens(store, user, payload.guestSessionId);
}

async function getCustomerProfile(customerId) {
  const store = await ensureAuthBootstrap();
  const user = store.users.find((item) => item.id === customerId);
  if (!user) {
    throw new HttpError(404, "Customer profile not found.");
  }

  return sanitizeCustomerUser(user);
}

async function linkCustomerIdentity(customerId, payload) {
  const store = await ensureAuthBootstrap();
  const user = store.users.find((item) => item.id === customerId);
  if (!user) {
    throw new HttpError(404, "Customer profile not found.");
  }

  if (!payload.email && !payload.mobile) {
    throw new HttpError(400, "At least one identity field (email/mobile) is required.");
  }

  if (payload.email) {
    const normalizedEmail = normalizeEmail(payload.email);
    const duplicateEmail = store.users.find(
      (item) =>
        item.id !== customerId &&
        item.email &&
        normalizeEmail(item.email) === normalizedEmail
    );
    if (duplicateEmail) {
      throw new HttpError(409, "Email is already linked to another account.");
    }

    user.email = normalizedEmail;
    if (payload.verifiedEmail === true) {
      user.verifiedEmail = true;
    }
  }

  if (payload.mobile) {
    const normalizedMobile = normalizeMobile(payload.mobile);
    const duplicateMobile = store.users.find(
      (item) => item.id !== customerId && item.mobile === normalizedMobile
    );
    if (duplicateMobile) {
      throw new HttpError(409, "Mobile is already linked to another account.");
    }

    user.mobile = normalizedMobile;
    if (payload.verifiedMobile === true) {
      user.verifiedMobile = true;
    }
  }

  user.updatedAt = new Date().toISOString();
  await writeAuthStore(store);

  return sanitizeCustomerUser(user);
}

async function adminMe(adminId) {
  const store = await ensureAuthBootstrap();
  const staffUser = store.staffUsers.find((user) => user.id === adminId);
  if (!staffUser) {
    throw new HttpError(404, "Admin profile not found.");
  }

  const permissions = buildAdminPermissions(store, staffUser);
  return toPublicAdmin(staffUser, permissions);
}

async function addGuestCartItem(payload) {
  await ensureAuthBootstrap();
  return addGuestCartItemLegacy(payload);
}

async function getGuestCart(sessionId) {
  await ensureAuthBootstrap();
  return getGuestCartLegacy(sessionId);
}

async function getCustomerCart(customerId) {
  await ensureAuthBootstrap();
  return getCustomerCartLegacy(customerId);
}

function publicBrowseHealth() {
  return {
    browse: true,
    message: "Guest browsing is enabled."
  };
}

function publicSearch(query) {
  const q = query.trim().toLowerCase();
  const demoMappings = [
    {
      phrase: "gate kholne wali machine",
      results: ["Sliding Gate Motor", "Swing Gate Motor"]
    },
    {
      phrase: "mobile se door open karna",
      results: ["Smart Door Lock", "QR Access Controller"]
    },
    {
      phrase: "shop ke liye camera",
      results: ["CCTV Dome Camera", "NVR Kit"]
    }
  ];

  const matches =
    q.length === 0
      ? []
      : demoMappings.filter(
          (item) => item.phrase.includes(q) || q.includes(item.phrase)
        );

  return {
    query: q,
    matches,
    note: "Phase 5 will replace this with full buyer-intent search engine."
  };
}

async function customerGoogleExchange(payload) {
  const profile = await exchangeGoogleCodeForProfile(payload.code, payload.redirectUri);
  return customerLoginGoogle({
    email: profile.email,
    name: profile.name,
    googleSub: profile.googleSub,
    guestSessionId: payload.guestSessionId || null,
    mobile: null
  });
}

module.exports = {
  ensureAuthBootstrap,
  adminLogin,
  refreshSession,
  revokeSession,
  customerRegisterEmail,
  customerLoginEmail,
  customerForgotPassword,
  customerResetPassword,
  customerLoginGoogle,
  customerGoogleExchange,
  getGoogleOAuthPublicConfig,
  requestOtp,
  verifyOtp,
  getCustomerProfile,
  linkCustomerIdentity,
  adminMe,
  addGuestCartItem,
  getGuestCart,
  getCustomerCart,
  publicBrowseHealth,
  publicSearch
};
