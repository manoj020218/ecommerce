const crypto = require("node:crypto");
const express = require("express");
const { readIntegrationsStore } = require("../../database/integrations-store");
const { jsonFileStore } = require("../../database/json-file-store");

// One-time admin-operated flow to authorize Gmail SMTP sending via OAuth2 (App
// Passwords are no longer offered on this Google account). Not exposed in any
// admin UI — run manually when the refresh token needs to be (re)issued.
let pendingState = null;

function buildAuthorizeUrl(clientId, redirectUri) {
  pendingState = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    login_hint: "jenixindia@gmail.com",
    state: pendingState
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function createGmailSmtpOAuthRouter() {
  const router = express.Router();

  // Visit this once, signed into jenixindia@gmail.com, to (re)authorize.
  router.get("/start", async (_req, res) => {
    const store = await readIntegrationsStore();
    const g = store.integrations?.googleOAuth;
    if (!g?.clientId) {
      return res.status(400).send("Google OAuth client is not configured.");
    }
    const redirectUri = `${_req.protocol}://${_req.get("host")}/api/gmail-smtp-oauth/callback`;
    const url = buildAuthorizeUrl(g.clientId, redirectUri);
    res.redirect(url);
  });

  router.get("/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`Authorization failed: ${error}`);
    if (!code || !state || state !== pendingState) {
      return res.status(400).send("Invalid or expired authorization attempt. Visit /start again.");
    }
    pendingState = null;

    try {
      const store = await readIntegrationsStore();
      const g = store.integrations?.googleOAuth;
      const redirectUri = `${req.protocol}://${req.get("host")}/api/gmail-smtp-oauth/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: g.clientId,
          client_secret: g.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.refresh_token) {
        return res.status(400).send(
          `Token exchange failed: ${tokenData.error_description || tokenData.error || "no refresh_token returned (try revoking prior access at myaccount.google.com/permissions and re-authorizing)"}`
        );
      }

      const settings = await jsonFileStore.readSettingsDocument();
      settings.setupWizard = settings.setupWizard || {};
      settings.setupWizard.smtpEmail = {
        ...settings.setupWizard.smtpEmail,
        authMethod: "oauth2",
        oauthRefreshToken: tokenData.refresh_token,
        configured: true
      };
      await jsonFileStore.writeSettingsDocument(settings);

      res.send("Gmail SMTP OAuth authorized successfully. You can close this tab.");
    } catch (err) {
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  return router;
}

module.exports = { createGmailSmtpOAuthRouter };
