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
      label: "Direct Bank Transfer",
      gatewayType: "manual",
      isEnabled: true,
      priority: 11,
      mode: "live",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      instructions: {
        accountHolderName: "Jenix India",
        bankName: "",
        accountNumber: "",
        ifsc: "",
        upiId: "",
        acceptedMethods: "NEFT, RTGS, IMPS, UPI",
        note: ""
      },
      updatedAt: null
    },
    {
      id: "pg_cod",
      code: "cod",
      label: "Cash on Delivery",
      gatewayType: "manual",
      isEnabled: true,
      priority: 20,
      mode: "live",
      minOrderValue: 0,
      maxOrderValue: null,
      credentials: {},
      instructions: { note: "Pay cash at the time of delivery" },
      updatedAt: null
    },
    {
      id: "pg_cashfree",
      code: "cashfree",
      label: "Cashfree",
      gatewayType: "online",
      isEnabled: false,
      priority: 3,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      updatedAt: null
    },
    {
      id: "pg_phonepe",
      code: "phonepe",
      label: "PhonePe",
      gatewayType: "online",
      isEnabled: false,
      priority: 4,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      updatedAt: null
    },
    {
      id: "pg_ccavenue",
      code: "ccavenue",
      label: "CCAvenue",
      gatewayType: "online",
      isEnabled: false,
      priority: 5,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      updatedAt: null
    },
    {
      id: "pg_payu",
      code: "payu",
      label: "PayU",
      gatewayType: "online",
      isEnabled: false,
      priority: 6,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      updatedAt: null
    },
    {
      id: "pg_paytm",
      code: "paytm",
      label: "Paytm",
      gatewayType: "online",
      isEnabled: false,
      priority: 7,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
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

let writeQueue = Promise.resolve();

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
  } catch (parseError) {
    const backupPath = paymentStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(paymentStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(paymentStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writePaymentStore(store) {
  const result = writeQueue.then(async () => {
    await ensurePaymentStoreFile();
    const tmpPath = paymentStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, paymentStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
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
