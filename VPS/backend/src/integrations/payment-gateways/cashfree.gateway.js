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

const CF_API_VERSION = "2023-08-01";

class CashfreeGateway extends PaymentGatewayAdapter {
  async _getConfig() {
    const store = await readPaymentStore();
    const gw = (store.gateways || []).find((g) => g.code === "cashfree");
    if (!gw) throw new Error("Cashfree gateway not found in payment store.");
    const creds = gw.credentials || {};
    return {
      appId: creds.appId || "",
      secretKey: creds.secretKey || "",
      webhookSecret: creds.webhookSecret || "",
      mode: gw.mode || "test",
      isEnabled: gw.isEnabled
    };
  }

  _baseUrl(mode) {
    return mode === "live"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";
  }

  async _cfRequest(method, path, body, config) {
    const url = `${this._baseUrl(config.mode)}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-version": CF_API_VERSION,
        "x-client-id": config.appId,
        "x-client-secret": config.secretKey
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.message || data?.error_description || `Cashfree error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async createPaymentOrder(input) {
    const config = await this._getConfig();

    if (!config.appId || !config.secretKey) {
      const attemptId = String(input.attemptId || "").trim();
      return {
        provider: "cashfree",
        gatewayOrderId: `cf_pending_${attemptId}`,
        amount: Number(input.amount || 0),
        currency: String(input.currency || "INR"),
        appId: "",
        mode: config.mode
      };
    }

    const data = await this._cfRequest("POST", "/orders", {
      order_id: String(input.attemptId || "").slice(0, 50),
      order_amount: Number(input.amount || 0),
      order_currency: String(input.currency || "INR"),
      customer_details: {
        customer_id: String(input.customerId || `guest_${input.attemptId}`).slice(0, 50),
        customer_phone: "9000000000"
      },
      order_meta: {
        notify_url: `${process.env.API_BASE_URL || "http://localhost:4100"}/api/payments/webhook/cashfree`
      }
    }, config);

    return {
      provider: "cashfree",
      gatewayOrderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      amount: input.amount,
      currency: String(input.currency || "INR"),
      appId: config.appId,
      mode: config.mode
    };
  }

  async verifyPayment(input) {
    const config = await this._getConfig();

    if (!config.appId || !config.secretKey) return { verified: true };

    const data = await this._cfRequest("GET", `/orders/${input.cf_order_id || input.order_id}`, null, config);
    const verified = data.order_status === "PAID";
    return { verified };
  }

  async handleWebhook(payload, rawBody, signature) {
    const config = await this._getConfig();
    const secretToUse = config.webhookSecret || config.secretKey;

    if (env.nodeEnv === "production" && !secretToUse) {
      // Never accept an unsigned webhook in production — a missing secret must fail
      // closed, not silently trust whoever calls the endpoint.
      throw new Error("Cashfree webhook secret is not configured; refusing unsigned webhook.");
    }

    if (rawBody && signature) {
      const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : String(rawBody);
      if (secretToUse) {
        const expected = crypto
          .createHmac("sha256", secretToUse)
          .update(bodyString)
          .digest("base64");
        if (!timingSafeStringEqual(expected, signature)) {
          throw new Error("Invalid Cashfree webhook signature.");
        }
      }
    } else if (secretToUse) {
      throw new Error("Cashfree webhook is missing signature or raw body.");
    }

    const type = String(payload.type || "");

    if (type.startsWith("PAYMENT_")) {
      const order = payload.data?.order || {};
      const payment = payload.data?.payment || {};

      const statusMap = {
        PAYMENT_SUCCESS_WEBHOOK: "success",
        PAYMENT_FAILED_WEBHOOK: "failed",
        PAYMENT_USER_DROPPED_WEBHOOK: "failed"
      };

      return {
        attemptId: String(order.order_id || "").trim(),
        status: statusMap[type] || null,
        gatewayTxnId: String(payment.cf_payment_id || "").trim(),
        failureReason: String(payment.payment_message || "").trim(),
        eventId: String(payload.event_time || order.order_id || "").trim()
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
    const config = await this._getConfig();

    if (!config.appId || !config.secretKey) return { accepted: true };

    const refundId = `refund_${input.gatewayTxnId}_${Date.now()}`;
    const data = await this._cfRequest(
      "POST",
      `/orders/${input.attemptId}/refunds`,
      {
        refund_id: refundId.slice(0, 40),
        refund_amount: Number(input.amount || 0),
        refund_note: String(input.reason || "Admin initiated refund")
      },
      config
    );

    return {
      accepted: true,
      refundId: data.refund_id || refundId,
      status: data.refund_status || "pending"
    };
  }

  async getPaymentStatus(input) {
    const config = await this._getConfig();

    if (!config.appId || !config.secretKey) {
      return { gatewayTxnId: String(input.gatewayTxnId || ""), status: "unknown" };
    }

    const data = await this._cfRequest("GET", `/orders/${input.attemptId}`, null, config);
    const statusMap = { PAID: "success", EXPIRED: "failed", ACTIVE: "pending" };

    return {
      gatewayTxnId: String(input.gatewayTxnId || ""),
      status: statusMap[data.order_status] || data.order_status || "unknown"
    };
  }
}

module.exports = { CashfreeGateway };
