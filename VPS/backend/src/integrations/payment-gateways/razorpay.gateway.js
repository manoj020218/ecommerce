const { PaymentGatewayAdapter } = require("./payment-gateway.adapter");

class RazorpayGateway extends PaymentGatewayAdapter {
  async createPaymentOrder(input) {
    const attemptId = String(input.attemptId || "").trim();
    const amount = Number(input.amount || 0);
    const gatewayOrderId = `rzp_order_${attemptId}`;

    return {
      provider: "razorpay",
      gatewayOrderId,
      amount,
      currency: String(input.currency || "INR"),
      paymentLink: `https://pay.example.local/razorpay/${encodeURIComponent(attemptId)}`
    };
  }

  async verifyPayment(_input) {
    return {
      verified: true
    };
  }

  async handleWebhook(payload) {
    return {
      attemptId: String(payload.attemptId || "").trim(),
      status: String(payload.status || "").trim().toLowerCase(),
      gatewayTxnId: String(payload.gatewayTxnId || "").trim(),
      failureReason: String(payload.failureReason || "").trim(),
      eventId:
        String(payload.eventId || "").trim() ||
        String(payload.gatewayTxnId || "").trim() ||
        ""
    };
  }

  async refundPayment(_input) {
    return {
      accepted: true
    };
  }

  async getPaymentStatus(input) {
    return {
      gatewayTxnId: String(input.gatewayTxnId || ""),
      status: "unknown"
    };
  }
}

module.exports = { RazorpayGateway };
