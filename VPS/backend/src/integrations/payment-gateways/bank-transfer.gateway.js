const { PaymentGatewayAdapter } = require("./payment-gateway.adapter");

class BankTransferGateway extends PaymentGatewayAdapter {
  async createPaymentOrder(input) {
    return {
      provider: "direct_bank_transfer",
      amount: Number(input.amount || 0),
      currency: String(input.currency || "INR"),
      instructions: input.instructions || {}
    };
  }

  async verifyPayment(_input) {
    return {
      verified: false
    };
  }

  async handleWebhook(_payload) {
    return {
      attemptId: "",
      status: "ignored",
      gatewayTxnId: "",
      failureReason: ""
    };
  }

  async refundPayment(_input) {
    return {
      accepted: false
    };
  }

  async getPaymentStatus(_input) {
    return {
      status: "manual_verification_required"
    };
  }
}

module.exports = { BankTransferGateway };
