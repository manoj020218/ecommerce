class PaymentGatewayAdapter {
  async createPaymentOrder() {
    throw new Error("TODO: implement createPaymentOrder in provider adapter.");
  }

  async verifyPayment() {
    throw new Error("TODO: implement verifyPayment in provider adapter.");
  }

  async handleWebhook() {
    throw new Error("TODO: implement handleWebhook in provider adapter.");
  }

  async refundPayment() {
    throw new Error("TODO: implement refundPayment in provider adapter.");
  }

  async getPaymentStatus() {
    throw new Error("TODO: implement getPaymentStatus in provider adapter.");
  }
}

function createPaymentGateway(gatewayCode) {
  const normalized = String(gatewayCode || "").trim().toLowerCase();

  if (normalized === "razorpay") {
    const { RazorpayGateway } = require("./razorpay.gateway");
    return new RazorpayGateway();
  }

  if (normalized === "mock_online" || normalized === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Mock payment gateway is disabled in production.");
    }
    const { MockOnlineGateway } = require("./mock-online.gateway");
    return new MockOnlineGateway();
  }

  if (normalized === "cashfree") {
    const { CashfreeGateway } = require("./cashfree.gateway");
    return new CashfreeGateway();
  }

  if (normalized === "manual_upi") {
    const { ManualUpiGateway } = require("./manual-upi.gateway");
    return new ManualUpiGateway();
  }

  if (normalized === "direct_bank_transfer" || normalized === "bank_transfer") {
    const { BankTransferGateway } = require("./bank-transfer.gateway");
    return new BankTransferGateway();
  }

  throw new Error(`Payment gateway '${gatewayCode}' is not implemented yet.`);
}

module.exports = { PaymentGatewayAdapter, createPaymentGateway };
