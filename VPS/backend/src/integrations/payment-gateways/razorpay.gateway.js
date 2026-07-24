const crypto = require("node:crypto");
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

    const Razorpay = require("razorpay");
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

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

    const Razorpay = require("razorpay");
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

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

    const Razorpay = require("razorpay");
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const payment = await rzp.payments.fetch(String(input.gatewayTxnId));

    const statusMap = { captured: "success", failed: "failed", created: "pending", authorized: "pending" };
    return { gatewayTxnId: payment.id, status: statusMap[payment.status] || payment.status };
  }
}

module.exports = { RazorpayGateway };
