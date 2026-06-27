const { PaymentGatewayAdapter } = require("./payment-gateway.adapter");

class MockOnlineGateway extends PaymentGatewayAdapter {
  async createPaymentOrder(input) {
    const attemptId = String(input.attemptId || "").trim();
    return {
      provider: "mock_online",
      gatewayOrderId: `mock_order_${attemptId}`,
      amount: Number(input.amount || 0),
      currency: String(input.currency || "INR"),
      paymentLink: `https://pay.example.local/mock/${encodeURIComponent(attemptId)}`
    };
  }

  async verifyPayment(_input) {
    return { verified: true };
  }

  async handleWebhook(payload) {
    return {
      attemptId: String(payload.attemptId || "").trim(),
      status: String(payload.status || "").trim().toLowerCase() || null,
      gatewayTxnId: String(payload.gatewayTxnId || "").trim(),
      failureReason: String(payload.failureReason || "").trim(),
      eventId: String(payload.eventId || payload.gatewayTxnId || "").trim()
    };
  }

  async refundPayment(_input) {
    return { accepted: true };
  }

  async getPaymentStatus(input) {
    return { gatewayTxnId: String(input.gatewayTxnId || ""), status: "unknown" };
  }
}

module.exports = { MockOnlineGateway };
