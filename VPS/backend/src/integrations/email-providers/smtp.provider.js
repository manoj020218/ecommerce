const nodemailer = require("nodemailer");
const { readIntegrationsStore } = require("../../database/integrations-store");

async function buildAuth(smtpConfig) {
  if (smtpConfig.authMethod === "oauth2" && smtpConfig.oauthRefreshToken) {
    const store = await readIntegrationsStore();
    const g = store.integrations?.googleOAuth || {};
    return {
      type: "OAuth2",
      user: smtpConfig.username,
      clientId: g.clientId,
      clientSecret: g.clientSecret,
      refreshToken: smtpConfig.oauthRefreshToken
    };
  }
  return { user: smtpConfig.username, pass: smtpConfig.password };
}

async function sendSmtpEmail({ smtpConfig, to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: Number(smtpConfig.port || 587),
    secure: Boolean(smtpConfig.secure),
    auth: await buildAuth(smtpConfig),
    tls: { rejectUnauthorized: false }
  });

  const from = smtpConfig.fromName
    ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`
    : smtpConfig.fromEmail;

  const info = await transporter.sendMail({
    from,
    ...(smtpConfig.replyToEmail ? { replyTo: smtpConfig.replyToEmail } : {}),
    to,
    subject,
    html,
    text: subject
  });

  return info.messageId;
}

module.exports = { sendSmtpEmail };
