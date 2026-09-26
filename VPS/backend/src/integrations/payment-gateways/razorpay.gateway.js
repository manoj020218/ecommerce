const crypto = require("node:crypto");
const https = require("node:https");
const { PaymentGatewayAdapter } = require("./payment-gateway.adapter");
const { readPaymentStore } = require("../../database/payment-store");
const { env } = require("../../config/env");

function timingSafeStringEqual(expected, actual) {
  const expectedBuf = Buffer.from(String(expected || ""), "utf-8");
  const actualBuf = Buffer.from(String(actual || ""), "utf-8");
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// keepAlive lets back-to-back Razorpay calls reuse one connection instead of
// paying DNS + TLS each time. Note (Sep 2026, measured on the VPS): the ~6s
// create-attempt was NOT IPv6 — the VPS's primary resolver 4.2.2.4 drops about
// half of all DNS queries, so a lookup waits the 5s resolver timeout before
// falling back to 8.8.4.4. That is fixed at the OS resolver level, not here.
// family: 4 is ignored by axios on the agent; left in, harmless (no IPv6 route).
const razorpayHttpsAgent = new https.Agent({ family: 4, keepAlive: true });

function createRazorpayClient(keyId, keySecret) {
  const Razorpay = require("razorpay");
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  if (rzp.api && rzp.api.rq && rzp.api.rq.defaults) {
    rzp.api.rq.defaults.httpsAgent = razorpayHttpsAgent;
  }
  return rzp;
}

class RazorpayGateway extends PaymentGatewayAdapter {
  async _getConfig() {
    const store = await readPaymentStore();
    const gw = (store.gateways || []).find((g) => g.code === "razorpay");
    if (!gw) throw new Error("Razorpay gateway not found in payment store.");
    const creds = gw.credentials || {};
    return {
      keyId: creds.keyId || "",
      keySecret: creds.keySecret || "",
      webhookSecret: creds.webhookSecret || "",
      mode: gw.mode || "test",
      isEnabled: gw.isEnabled
    };
  }

  async createPaymentOrder(input) {
    const { keyId, keySecret, mode } = await this._getConfig();

    if (!keyId || !keySecret) {
      const attemptId = String(input.attemptId || "").trim();
      return {
        provider: "razorpay",
        gatewayOrderId: `rzp_pending_${attemptId}`,
        amount: Number(input.amount || 0),
        currency: String(input.currency || "INR"),
        keyId: "",
        mode
      };
    }

    // const Razorpay = require("razorpay");
    // const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const rzp = createRazorpayClient(keyId, keySecret);

    const amountPaise = Math.round(Number(input.amount || 0) * 100);
    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: String(input.currency || "INR"),
      receipt: String(input.attemptId || "").slice(0, 40),
      notes: {
        checkoutSessionId: String(input.checkoutSessionId || ""),
        attemptId: String(input.attemptId || "")
      }
    });

    return {
      provider: "razorpay",
      gatewayOrderId: order.id,
      amount: input.amount,
      currency: String(input.currency || "INR"),
      keyId,
      mode
    };
  }

  async verifyPayment(input) {
    const { keySecret } = await this._getConfig();

    if (!keySecret) return { verified: true };

    const body = `${input.razorpay_order_id}|${input.razorpay_payment_id}`;
    const expected = crypto.createHmac("sha256", keySecret).update(body).digest("hex");
    return { verified: timingSafeStringEqual(expected, input.razorpay_signature) };
  }

  async handleWebhook(payload, rawBody, signature) {
    const { webhookSecret } = await this._getConfig();

    if (env.nodeEnv === "production" && !webhookSecret) {
      // Never accept an unsigned webhook in production — a missing secret must fail
      // closed, not silently trust whoever calls the endpoint.
      throw new Error("Razorpay webhook secret is not configured; refusing unsigned webhook.");
    }

    if (webhookSecret && signature && rawBody) {
      const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : String(rawBody);
      const expected = crypto.createHmac("sha256", webhookSecret).update(bodyString).digest("hex");
      if (!timingSafeStringEqual(expected, signature)) {
        throw new Error("Invalid Razorpay webhook signature.");
      }
    } else if (webhookSecret && (!signature || !rawBody)) {
      throw new Error("Razorpay webhook is missing signature or raw body.");
    }

    const event = String(payload.event || "");

    // Only payment.captured creates an order from a webhook. Everything else a
    // Razorpay account can send is acknowledged and ignored:
    // - payment.failed: the customer can retry inside the same checkout window
    //   (same order_id), and the storefront already handles failures itself;
    //   acting on it here would send "payment failed" messages to buyers who
    //   go on to pay successfully a few seconds later.
    // - payment.authorized / order.paid / refund.* etc.: nothing to do.
    if (event) {
      const paymentEntity = payload.payload?.payment?.entity || {};
      if (event !== "payment.captured") {
        return { ignored: true, event };
      }
      return {
        event,
        attemptId: String(paymentEntity.notes?.attemptId || "").trim(),
        gatewayOrderId: String(paymentEntity.order_id || "").trim(),
        status: "success",
        gatewayTxnId: String(paymentEntity.id || "").trim(),
        failureReason: "",
        eventId: String(payload.id || "").trim() || `${event}:${String(paymentEntity.id || "").trim()}`
      };
    }

    // Previous handling (kept for reference): read attemptId from the payment's
    // notes/receipt, which Razorpay payments never carry, so it always 400'd.
    if (event.startsWith("payment.")) {
      const paymentEntity = payload.payload?.payment?.entity || {};
      const statusMap = { "payment.captured": "success", "payment.failed": "failed" };
      const attemptId = String(
        paymentEntity.notes?.attemptId ||
        paymentEntity.receipt ||
        ""
      ).trim();

      return {
        attemptId,
        status: statusMap[event] || null,
        gatewayTxnId: String(paymentEntity.id || "").trim(),
        failureReason: String(paymentEntity.error_description || paymentEntity.error_reason || "").trim(),
        eventId: String(payload.id || "").trim()
      };
    }

    return {
      attemptId: String(payload.attemptId || "").trim(),
      status: String(payload.status || "").trim().toLowerCase() || null,
      gatewayTxnId: String(payload.gatewayTxnId || "").trim(),
      failureReason: String(payload.failureReason || "").trim(),
      eventId: String(payload.eventId || payload.gatewayTxnId || "").trim()
    };
  }

  async refundPayment(input) {
    const { keyId, keySecret } = await this._getConfig();

    if (!keyId || !keySecret) return { accepted: true };

    // const Razorpay = require("razorpay");
    // const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const rzp = createRazorpayClient(keyId, keySecret);

    const amountPaise = input.amount ? Math.round(Number(input.amount) * 100) : undefined;
    const refund = await rzp.payments.refund(String(input.gatewayTxnId), {
      ...(amountPaise ? { amount: amountPaise } : {}),
      notes: { reason: String(input.reason || "Admin initiated refund") }
    });

    return { accepted: true, refundId: refund.id, status: refund.status };
  }

  async getPaymentStatus(input) {
    const { keyId, keySecret } = await this._getConfig();

    if (!keyId || !keySecret) {
      return { gatewayTxnId: String(input.gatewayTxnId || ""), status: "unknown" };
    }

    // const Razorpay = require("razorpay");
    // const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const rzp = createRazorpayClient(keyId, keySecret);
    const payment = await rzp.payments.fetch(String(input.gatewayTxnId));

    const statusMap = { captured: "success", failed: "failed", created: "pending", authorized: "pending" };
    return { gatewayTxnId: payment.id, status: statusMap[payment.status] || payment.status };
  }
}

module.exports = { RazorpayGateway };
