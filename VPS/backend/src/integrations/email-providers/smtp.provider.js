const nodemailer = require("nodemailer");

async function sendSmtpEmail({ smtpConfig, to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: Number(smtpConfig.port || 587),
    secure: Boolean(smtpConfig.secure),
    auth: {
      user: smtpConfig.username,
      pass: smtpConfig.password
    },
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
