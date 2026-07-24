/**
 * push-descriptions.js
 *
 * Cleans product descriptions from migration data and pushes ONLY
 * shortDescription + fullDescription to the live admin API.
 *
 * SAFE: Never touches HSN, price, stock, or any other field.
 *
 * Usage: node scripts/push-descriptions.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Allow self-signed / unverified certs on VPS (Let's Encrypt sometimes needs this on Windows)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = "https://api.jenixindia.com/api";
const ADMIN_EMAIL = "admin@jenixindia.com";
const ADMIN_PASSWORD = process.env.JENIX_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error("Set JENIX_ADMIN_PASSWORD in the environment before running this script.");
  process.exit(1);
}
const MIGRATION_JSON = path.join(__dirname, "migration/output/products_import.json");
const CLEANED_JSON = path.join(__dirname, "migration/output/products_descriptions_cleaned.json");

// ── HTTP helper ───────────────────────────────────────────────────────────────

function apiRequest(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
    };
    const req = lib.request(
      { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === "https:" ? 443 : 80), path: parsed.pathname + parsed.search, method, headers },
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

// ── Description cleaner ───────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanDescription(text) {
  if (!text || typeof text !== "string") return "";

  let s = text;

  // 1. Strip "Previous Next" navigation artifacts (image gallery nav)
  s = s.replace(/Previous\s+Next\s*/gi, "");

  // 2. Strip "Product Description" heading prefix
  s = s.replace(/^Product\s*Description\s*/i, "");

  // 3. Strip price blocks — ₹1,499  ₹9,999 (Including/Excluding X% tax) XX% OFF
  s = s.replace(/[₹₹]\s*[\d,]+(\.\d+)?\s*/g, "");
  s = s.replace(/\((?:Including|Excluding)\s+\d+\s*%\s*tax\)/gi, "");
  s = s.replace(/\d+%\s*OFF/gi, "");

  // 4. Strip CSS blocks  (.classname { ... })
  s = s.replace(/\.[a-zA-Z][\w-]*\s*\{[^}]*\}/gs, "");

  // 5. Strip e-commerce UI junk
  s = s.replace(/Quantity\s*[-+]+[^\n]*/gi, "");
  s = s.replace(/Add\s+to\s+Cart[^\n]*/gi, "");
  s = s.replace(/Out\s+of\s+stock[^\n]*/gi, "");
  s = s.replace(/In\s+stock[^\n]*/gi, "");
  s = s.replace(/Buy\s+Now[^\n]*/gi, "");

  // 6. Strip corrupted Unicode price symbols and stray rupee chars
  s = s.replace(/â‚¹/g, "");
  s = s.replace(/â¹/g, "");

  // 7. Collapse excess whitespace and clean up
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();

  // If basically nothing left, return empty
  if (s.length < 40) return "";

  // 8. Split into paragraphs on double newlines
  const rawParas = s.split(/\n{2,}/);

  // 9. For each paragraph, also split on "Features:" or "Specifications:" headings
  const paras = [];
  for (const raw of rawParas) {
    const line = raw.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
    if (line.length < 15) continue;
    // Skip lines that are purely CSS leftovers or price junk
    if (/^\s*[{}]\s*$/.test(line)) continue;
    if (/^margin|^padding|^font|^color|^display|^position/.test(line.toLowerCase())) continue;
    paras.push(line);
  }

  if (paras.length === 0) return "";

  return paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
}

function makeShortDescription(fullHtml) {
  if (!fullHtml) return "";
  // Extract first paragraph as short description (max 300 chars)
  const match = fullHtml.match(/<p>([\s\S]*?)<\/p>/);
  if (!match) return "";
  const text = match[1];
  if (text.length <= 300) return `<p>${text}</p>`;
  // Trim at last word boundary before 300
  const trimmed = text.slice(0, 297).replace(/\s+\S*$/, "");
  return `<p>${trimmed}…</p>`;
}

// ── Slug normaliser (matches backend logic) ───────────────────────────────────

function normalizeSlug(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== push-descriptions.js ===\n");

  // 1. Load migration data
  console.log("Loading migration data…");
  const migrationProducts = JSON.parse(fs.readFileSync(MIGRATION_JSON, "utf8"));
  console.log(`  ${migrationProducts.length} products in migration file`);

  // 2. Clean descriptions
  console.log("\nCleaning descriptions…");
  let goodCount = 0;
  let emptyCount = 0;

  const cleaned = migrationProducts.map((p) => {
    const fullClean = cleanDescription(p.fullDescription);
    const shortRaw = cleanDescription(p.shortDescription);
    const shortClean = shortRaw || makeShortDescription(fullClean);

    if (fullClean) goodCount++;
    else emptyCount++;

    return {
      slug: p.slug,
      title: p.title,
      oldUrl: p.oldUrl,
      shortDescription: shortClean,
      fullDescription: fullClean,
    };
  });

  console.log(`  Good descriptions: ${goodCount}`);
  console.log(`  Empty after clean: ${emptyCount} (these had only garbage)`);

  // 3. Save cleaned file
  fs.writeFileSync(CLEANED_JSON, JSON.stringify(cleaned, null, 2), "utf8");
  console.log(`\n  Saved cleaned data → ${CLEANED_JSON}`);

  // 4. Login to admin API
  console.log("\nLogging in to admin API…");
  let token;
  try {
    const loginRes = await apiRequest("POST", `${API_BASE}/admin/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.accessToken || loginRes.token || loginRes.data?.accessToken;
    if (!token) throw new Error("No token in response: " + JSON.stringify(loginRes).slice(0, 200));
    console.log("  Logged in OK");
  } catch (e) {
    console.error("  Login failed:", e.message);
    process.exit(1);
  }

  // 5. Fetch all live products
  console.log("\nFetching live products…");
  let liveProducts;
  try {
    const res = await apiRequest("GET", `${API_BASE}/admin/products?includeInactive=true`, null, token);
    liveProducts = Array.isArray(res) ? res : (Array.isArray(res.data) ? res.data : res.products || []);
    console.log(`  ${liveProducts.length} products in live store`);
  } catch (e) {
    console.error("  Fetch failed:", e.message);
    process.exit(1);
  }

  if (liveProducts.length === 0) {
    console.log("\n  No live products found — nothing to update.");
    process.exit(0);
  }

  // 6. Build lookup maps (slug → live product)
  const liveBySlug = new Map();
  const liveByOldUrl = new Map();
  for (const p of liveProducts) {
    if (p.slug) liveBySlug.set(normalizeSlug(p.slug), p);
    if (p.oldUrl) liveByOldUrl.set((p.oldUrl || "").trim().toLowerCase(), p);
  }

  // 7. Match and PATCH — ONLY shortDescription + fullDescription
  console.log("\nMatching and pushing descriptions…");
  let matched = 0;
  let skipped = 0;
  let failed = 0;
  let noMatch = 0;
  let alreadyHas = 0;

  for (const m of cleaned) {
    if (!m.fullDescription) { skipped++; continue; }

    // Find live product
    const slug = normalizeSlug(m.slug);
    const oldUrlKey = (m.oldUrl || "").trim().toLowerCase();
    let live = liveBySlug.get(slug) || liveByOldUrl.get(oldUrlKey);

    if (!live) {
      noMatch++;
      continue;
    }

    // Skip if live product already has a description (admin may have edited it manually)
    const existingFull = (live.fullDescription || "").trim();
    if (existingFull.length > 50) {
      alreadyHas++;
      continue;
    }

    // PATCH only descriptions — nothing else
    try {
      await apiRequest(
        "PATCH",
        `${API_BASE}/admin/products/${live.id}`,
        {
          shortDescription: m.shortDescription,
          fullDescription: m.fullDescription,
        },
        token
      );
      matched++;
      process.stdout.write(`  ✓ [${matched}] ${(live.title || "").slice(0, 60)}\n`);
    } catch (e) {
      failed++;
      console.error(`  ✗ FAILED: ${(live.title || "").slice(0, 50)} — ${e.message}`);
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 120));
  }

  // 8. Summary
  console.log("\n=== DONE ===");
  console.log(`  Updated:          ${matched}`);
  console.log(`  Already had desc: ${alreadyHas} (skipped — not overwritten)`);
  console.log(`  No match in live: ${noMatch}`);
  console.log(`  Empty desc skip:  ${skipped}`);
  console.log(`  Errors:           ${failed}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
