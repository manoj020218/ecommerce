const { HttpError } = require("../../common/http-error");
const { readIntegrationsStore } = require("../../database/integrations-store");

async function getGoogleOAuthConfig() {
  const store = await readIntegrationsStore();
  return store.integrations?.googleOAuth || { enabled: false, clientId: "", clientSecret: "" };
}

async function getGoogleOAuthPublicConfig() {
  const config = await getGoogleOAuthConfig();
  return {
    enabled: Boolean(config.enabled),
    clientId: config.enabled ? (config.clientId || "") : ""
  };
}

// Exchange Google authorization code for user profile.
// Returns { googleSub, email, name }.
// Trusts the ID token because it came directly from Google's token endpoint (not user-supplied).
async function exchangeGoogleCodeForProfile(code, redirectUri) {
  const config = await getGoogleOAuthConfig();
  if (!config.enabled || !config.clientId || !config.clientSecret) {
    throw new HttpError(400, "Google login is not enabled. Configure it in admin → Integrations.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  const tokens = await tokenRes.json();
  if (tokens.error) {
    throw new HttpError(401, `Google authentication failed: ${tokens.error_description || tokens.error}`);
  }
  if (!tokens.id_token) {
    throw new HttpError(401, "Google did not return an ID token.");
  }

  // Decode JWT payload (base64url) — trusted since we received it from Google directly
  const [, payloadB64] = tokens.id_token.split(".");
  let profile;
  try {
    profile = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(401, "Failed to decode Google ID token.");
  }

  if (!profile.email) {
    throw new HttpError(400, "Google account did not share an email address.");
  }

  return {
    googleSub: profile.sub,
    email: profile.email,
    name: profile.name || profile.given_name || profile.email.split("@")[0]
  };
}

module.exports = { getGoogleOAuthPublicConfig, exchangeGoogleCodeForProfile };
