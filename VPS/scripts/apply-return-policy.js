#!/usr/bin/env node
// Applies the 2026-09 Return & Replacement Policy (user-approved):
//  1. static page "refund-policy" -> new title + content (scripts/content/return-policy-2026-09.html)
//  2. settings.invoiceSettings.invoiceTerms -> short terms matching the policy
// The old page content and old invoice terms are saved to a backup JSON first.
// Dry run by default; pass --apply to write. Run with jenix-backend STOPPED
// (settings may be cached in memory; the restart picks up the new values).
// Usage (from VPS/): node scripts/apply-return-policy.js [--apply]

const fs = require("node:fs");
const path = require("node:path");

const dir = path.resolve(process.cwd(), "backend/src/database/json");
const pagesPath = path.join(dir, "static-pages-store.json");
const settingsPath = path.join(dir, "settings.json");
const apply = process.argv.includes("--apply");

const pages = JSON.parse(fs.readFileSync(pagesPath, "utf8"));
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const profile = settings.storeProfile || {};

const esc = (v) => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pick = (...vals) => vals.find((v) => typeof v === "string" && v.trim()) || "";
const values = {
  storeName: esc(pick(profile.storeName, profile.businessName, "Jenix India")),
  phone: esc(pick(profile.supportWhatsApp, profile.supportMobile, profile.phone, "07240226566")),
  email: esc(pick(profile.supportEmail, profile.email, "")),
  address: esc(pick(profile.address, profile.addressLine1, profile.storeAddress, "")).replace(/\s*\n\s*/g, ", "),
  effectiveDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
};
values.addressLine = values.address ? ` · ${values.address}` : "";

let html = fs.readFileSync(path.resolve(process.cwd(), "scripts/content/return-policy-2026-09.html"), "utf8");
for (const [k, v] of Object.entries(values)) html = html.split(`{{${k}}}`).join(v);
if (!values.email) html = html.replace(/ or <strong>email <\/strong>/g, "").replace(/ · Email: <br>/g, "<br>");
const leftover = html.match(/\{\{[a-zA-Z]+\}\}/g);
if (leftover) { console.error("unfilled placeholders:", leftover); process.exit(1); }

const newTerms =
  "1. All disputes are subject to Jaipur jurisdiction only. " +
  "2. Only items marked 'Return eligible' on our website can be replaced, and only for a manufacturing defect on arrival reported within 5 days of delivery with an unboxing video; replacement only, no cash refund; return shipping paid by the buyer. " +
  "3. All other items are sold as is and are not returnable or exchangeable. " +
  "4. Manufacturer warranty, where applicable, is as per the brand's terms. " +
  "5. Full policy: jenixindia.com/refund-policy";

const page = (pages.pages || []).find((p) => p.slug === "refund-policy");
if (!page) { console.error("refund-policy page not found"); process.exit(1); }
settings.invoiceSettings = settings.invoiceSettings || {};

console.log("values used:", values);
console.log("page: title", JSON.stringify(page.title), "->", JSON.stringify("Return & Replacement Policy"), "| content", (page.content || "").length, "->", html.length, "chars");
console.log("invoice terms OLD:", settings.invoiceSettings.invoiceTerms);
console.log("invoice terms NEW:", newTerms);
if (!apply) { console.log("dry run - nothing written (pass --apply)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(dir, `return-policy-previous-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify({
  savedAt: new Date().toISOString(),
  refundPolicyPage: page,
  invoiceTerms: settings.invoiceSettings.invoiceTerms
}, null, 2));
console.log("backup ->", backupPath);

const now = new Date().toISOString();
page.title = "Return & Replacement Policy";
page.metaTitle = "Return & Replacement Policy | " + values.storeName;
page.metaDescription = "Replacement only for return-eligible products with a manufacturing defect on arrival, reported within 5 days with an unboxing video. Items sold as is are not returnable.";
page.content = html;
page.updatedAt = now;
settings.invoiceSettings.invoiceTerms = newTerms;

for (const [p, data] of [[pagesPath, pages], [settingsPath, settings]]) {
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, p);
}
console.log("written: refund-policy page + invoice terms");
