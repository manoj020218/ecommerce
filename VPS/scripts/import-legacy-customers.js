// Imports legacy customer contacts (exported from the third-party platform) into
// auth-store.json as real user records, so OTP-mobile login recognizes them as
// returning customers instead of creating duplicates.
//
// Usage: node scripts/import-legacy-customers.js [--apply]
// Dry-run by default; pass --apply to actually write.
const fs = require("fs");
const path = require("path");

const CSV_PATH = path.resolve(__dirname, "../../../customer_contacts.csv");
const STORE_PATH = path.resolve(__dirname, "../backend/src/database/json/auth-store.json");
const apply = process.argv.includes("--apply");

function normalizeMobileForImport(raw) {
  // Match the app's own convention: bare 10-digit, no +91, no spaces/dashes.
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function parseCsvLine(line) {
  // Simple CSV parser sufficient for this fixed 4-column, no-embedded-comma export.
  return line.split(",").map((s) => s.trim());
}

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

const raw = fs.readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, "");
const lines = raw.split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines[0]);
const rows = lines.slice(1).map(parseCsvLine);

const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
store.users = store.users || [];

const existingEmails = new Set(store.users.map((u) => (u.email || "").toLowerCase()));
const existingMobiles = new Set(store.users.map((u) => u.mobile).filter(Boolean));

const now = new Date().toISOString();
let imported = 0;
let skippedDuplicate = 0;
let skippedNoContact = 0;

for (const row of rows) {
  const [customerId, name, email, mobileRaw] = row;
  const cleanEmail = (email || "").trim().toLowerCase();
  const mobile = normalizeMobileForImport(mobileRaw);

  if (!cleanEmail && !mobile) {
    skippedNoContact += 1;
    continue;
  }
  if ((cleanEmail && existingEmails.has(cleanEmail)) || (mobile && existingMobiles.has(mobile))) {
    skippedDuplicate += 1;
    continue;
  }

  store.users.push({
    id: generateId("user_legacy"),
    name: name || "Customer",
    email: cleanEmail,
    mobile,
    verifiedEmail: false,
    verifiedMobile: false,
    passwordHash: null,
    authProviders: [],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    companyName: "",
    savedAddresses: [],
    savedProductIds: [],
    gstDetails: { gstin: "", businessName: "", contactName: "" },
    customerType: "retail",
    isB2BApproved: false,
    creditAllowed: false,
    bankTransferOnly: false,
    pickupAllowed: false,
    orderMode: "online",
    legacyCustomerId: customerId || ""
  });
  if (cleanEmail) existingEmails.add(cleanEmail);
  if (mobile) existingMobiles.add(mobile);
  imported += 1;
}

console.log(`${apply ? "APPLIED" : "DRY-RUN"} — rows: ${rows.length}, imported: ${imported}, duplicates skipped: ${skippedDuplicate}, no-contact skipped: ${skippedNoContact}`);
console.log(`Total users after import: ${store.users.length}`);

if (apply) {
  fs.copyFileSync(STORE_PATH, STORE_PATH + ".bak-" + Date.now());
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
  console.log("Saved. Backup written next to auth-store.json.");
}
