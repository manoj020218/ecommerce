/**
 * vps-push-descriptions.js  — run on the VPS via: node scripts/vps-push-descriptions.js
 * Uses localhost API (no TLS). Only updates shortDescription + fullDescription.
 * Never touches HSN, price, stock, or any other field.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

const API_BASE = "http://localhost:4100/api";
const ADMIN_EMAIL = "admin@jenixindia.com";
const ADMIN_PASSWORD = process.env.JENIX_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error("Set JENIX_ADMIN_PASSWORD in the environment before running this script.");
  process.exit(1);
}
const CLEANED_JSON = path.join(__dirname, "products_descriptions_cleaned.json");

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
    };
    const req = http.request(
      { hostname: "localhost", port: 4100, path: urlPath, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${json.message || data.slice(0, 200)}`));
            else resolve(json);
          } catch {
            if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${data.slice(0, 200)}`));
            else resolve(data);
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function normalizeSlug(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("=== vps-push-descriptions.js ===\n");

  const cleaned = JSON.parse(fs.readFileSync(CLEANED_JSON, "utf8"));
  console.log(`Loaded ${cleaned.length} cleaned records`);

  // Login
  console.log("Logging in…");
  const loginRes = await apiRequest("POST", "/api/auth/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  const token = loginRes.accessToken || loginRes.token || loginRes.data?.accessToken;
  if (!token) throw new Error("No token: " + JSON.stringify(loginRes).slice(0, 200));
  console.log("Logged in OK\n");

  // Fetch all live products
  console.log("Fetching live products…");
  const res = await apiRequest("GET", "/api/admin/products?includeInactive=true", null, token);
  const liveProducts = Array.isArray(res) ? res : (Array.isArray(res.data) ? res.data : res.products || []);
  console.log(`${liveProducts.length} products in live store\n`);

  if (liveProducts.length === 0) {
    console.log("No live products — nothing to do.");
    return;
  }

  // Build lookup maps
  const liveBySlug = new Map();
  const liveByOldUrl = new Map();
  for (const p of liveProducts) {
    if (p.slug) liveBySlug.set(normalizeSlug(p.slug), p);
    if (p.oldUrl) liveByOldUrl.set((p.oldUrl || "").trim().toLowerCase(), p);
  }

  let updated = 0, skippedEmpty = 0, skippedHasDesc = 0, noMatch = 0, failed = 0;

  for (const m of cleaned) {
    if (!m.fullDescription) { skippedEmpty++; continue; }

    const live = liveBySlug.get(normalizeSlug(m.slug)) || liveByOldUrl.get((m.oldUrl || "").trim().toLowerCase());
    if (!live) { noMatch++; continue; }

    // Skip ONLY if the live description looks like it was manually written (clean, no migration junk).
    // Replace if it still has raw migration artifacts: "Previous Next", "Product Description" prefix,
    // price symbols (₹ or the mojibake â‚¹), or embedded CSS blocks.
    const existingDesc = (live.fullDescription || "").trim();
    if (existingDesc.length > 50) {
      const isDirty =
        /Previous\s+Next/i.test(existingDesc) ||
        /^Product\s*Description/i.test(existingDesc) ||
        /â‚¹|₹/.test(existingDesc) ||
        /\.[a-zA-Z][\w-]*\s*\{/.test(existingDesc) ||
        /\d+%\s*OFF/i.test(existingDesc);
      if (!isDirty) { skippedHasDesc++; continue; }  // clean manual edit — leave it
    }

    try {
      await apiRequest("PATCH", `/api/admin/products/${live.id}`, {
        shortDescription: m.shortDescription || "",
        fullDescription: m.fullDescription
      }, token);
      updated++;
      console.log(`  [${updated}] ${(live.title || "").slice(0, 65)}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL: ${(live.title || "").slice(0, 50)} — ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log("\n=== COMPLETE ===");
  console.log(`  Updated:                ${updated}`);
  console.log(`  Skipped (has desc):     ${skippedHasDesc}`);
  console.log(`  Skipped (no match):     ${noMatch}`);
  console.log(`  Skipped (empty desc):   ${skippedEmpty}`);
  console.log(`  Errors:                 ${failed}`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
