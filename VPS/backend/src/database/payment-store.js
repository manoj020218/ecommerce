const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const paymentStorePath = path.resolve(process.cwd(), env.paymentStorePath);

const DEFAULT_PAYMENT_STORE = Object.freeze({
  gateways: [
    {
      id: "pg_razorpay",
      code: "razorpay",
      label: "Razorpay",
      gatewayType: "online",
      isEnabled: true,
      priority: 1,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      updatedAt: null
    },
    {
      id: "pg_mock_online",
      code: "mock_online",
      label: "Mock Online Gateway",
      gatewayType: "online",
      isEnabled: true,
      priority: 2,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      updatedAt: null
    },
    {
      id: "pg_manual_upi",
      code: "manual_upi",
      label: "Manual UPI",
      gatewayType: "manual",
      isEnabled: true,
      priority: 10,
      mode: "live",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      instructions: {
        beneficiaryName: "Jenix India",
        upiId: "payments@jenixindia"
      },
      updatedAt: null
    },
    {
      id: "pg_bank_transfer",
      code: "direct_bank_transfer",
      label: "Bank Transfer",
      gatewayType: "manual",
      isEnabled: true,
      priority: 11,
      mode: "live",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      instructions: {
        beneficiaryName: "Jenix India",
        bankName: "",
        accountNumber: "",
        ifsc: ""
      },
      updatedAt: null
    }
  ],
  directPaymentDiscount: {
    enabled: true,
    percent: 2,
    applicableMethods: ["direct_bank_transfer", "manual_upi"]
  },
  manualPaymentSubmissions: [],
  processedWebhooks: []
});

function cloneDefaultPaymentStore() {
  return JSON.parse(JSON.stringify(DEFAULT_PAYMENT_STORE));
}

async function ensurePaymentStoreFile() {
  const directoryPath = path.dirname(paymentStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(paymentStorePath);
  } catch (_error) {
    await fs.writeFile(
      paymentStorePath,
      JSON.stringify(cloneDefaultPaymentStore(), null, 2),
      "utf-8"
    );
  }
}

async function readPaymentStore() {
  await ensurePaymentStoreFile();
  const raw = await fs.readFile(paymentStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const fallback = cloneDefaultPaymentStore();
    await fs.writeFile(paymentStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writePaymentStore(store) {
  await ensurePaymentStoreFile();
  await fs.writeFile(paymentStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

async function resetPaymentStoreForRegression() {
  const fallback = cloneDefaultPaymentStore();
  await writePaymentStore(fallback);
  return fallback;
}

module.exports = {
  cloneDefaultPaymentStore,
  readPaymentStore,
  writePaymentStore,
  resetPaymentStoreForRegression
};
