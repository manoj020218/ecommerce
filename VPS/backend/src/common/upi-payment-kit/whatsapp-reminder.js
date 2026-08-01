// Portable "ask the buyer to upload their payment screenshot" WhatsApp
// reminder. Dependency-injected on purpose — this file never imports a
// specific WhatsApp integration directly, only takes a `sendMessage(mobile,
// text)` function as a parameter. Drop this whole file into any Node/Express
// project and wire it to whatever WhatsApp sender that project already has
// (Baileys, an official Business API client, Twilio, etc.) — nothing else
// here is jenix-specific.

function buildReminderMessage({ customerName, orderNo, amount, actionUrl, templateText }) {
  if (templateText) {
    return templateText
      .replace(/\{\{\s*customerName\s*\}\}/g, customerName || "there")
      .replace(/\{\{\s*orderNo\s*\}\}/g, orderNo || "")
      .replace(/\{\{\s*amount\s*\}\}/g, amount != null ? String(amount) : "")
      .replace(/\{\{\s*actionUrl\s*\}\}/g, actionUrl || "");
  }

  return [
    `Hi ${customerName || "there"},`,
    `Your order ${orderNo || ""} is waiting for payment confirmation.`,
    "You're on a computer, so here's a reminder to upload the payment screenshot from your phone:",
    actionUrl || ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendPaymentScreenshotReminder({
  sendMessage,
  mobile,
  customerName,
  orderNo,
  amount,
  actionUrl,
  templateText
}) {
  if (typeof sendMessage !== "function") {
    throw new Error("sendPaymentScreenshotReminder requires a sendMessage(mobile, text) function.");
  }
  if (!mobile) {
    return { sent: false, reason: "no_mobile" };
  }

  const message = buildReminderMessage({ customerName, orderNo, amount, actionUrl, templateText });

  try {
    await sendMessage(mobile, message);
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message || "send_failed" };
  }
}

module.exports = { sendPaymentScreenshotReminder, buildReminderMessage };
