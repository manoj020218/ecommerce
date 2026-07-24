# Jenix Commerce (jenixindia.com) — Critical Audit Report

**Scope:** Backend (Node/Express + JSON flat-file stores), storefront + admin panel (React), migration/crawler scripts, and the VPS deployment. Focus: what can harm **buyers, admins, or the VPS**, and what threatens a **10-year** run.
**Trigger:** Reported data damage — scraped product descriptions from the old jenixindia.com landing in the SEO **meta description** field.
**Date:** 2026-07-11
**Method:** Live production data on the VPS was probed with read-only, count-only scripts (no secret values read; Razorpay/payment credentials were never accessed or transmitted off the dev machine).

> **Verdict:** The reported damage is **real but recoverable — no descriptions were lost.** The single biggest *live* risk is not the descriptions, it's an **unfixed payment-confirmation bypass** that lets someone mark a real order paid without paying. Data durability (flat-file store with no pruning) is the biggest *10-year* risk.

---

## Data-damage findings (the reported issue)

### DATA-01 — 🔴 306 products have a bloated `metaDescription` (SEO field polluted, and it blocks admin saves)
**Measured on production (382 products):**
- `metaDescription` **> 200 chars: 337 / 382 products** (samples 719–1024 chars).
- Only **76 / 382** have a `metaDescription` within a sane length (≤ 320).
- **fullDescription intact on all 382** (every product still has its real description ≥ 30 chars). `metaDescription` never equals `fullDescription`, so it's a truncated *slice* of the description, not a copy.

**What happened:** a migration/enrichment step wrote a long chunk of the product description (capped ~1024 chars) into `metaDescription`, which is meant to be a ~155-char SEO snippet. The actual product descriptions are **safe** in `fullDescription` / `shortDescription`.

**Why it hurts — two ways:**
1. **Buyer / Google-facing (SEO):** `seo.service.js:40-41,77` renders `product.metaDescription` straight into the storefront `<meta name="description">` and into the Google Merchant `<g:description>` feed. A 1024-char meta description is truncated by Google (~160 chars), reads as spam, weakens search snippets and click-through — corrosive to a 10-year SEO investment, and can trip Google Merchant feed limits.
2. **Admin-blocking:** `products.validator.js:120,179` caps `metaDescription` at **max(320)**. The ~306 products over 320 chars now **fail validation on every edit → `400 Validation failed`**. This is the "can't save product" symptom — the admin literally cannot fix these products through the panel.

**Corrective action (safe, non-destructive):** run a one-time repair that, for every product, rebuilds `metaDescription` as a clean plain-text snippet (strip HTML, collapse whitespace, ~155 chars, trailing ellipsis) derived from `shortDescription`/`fullDescription`. This fixes SEO **and** unblocks admin saves, and leaves the real descriptions untouched. A ready script is provided in **Appendix A** (backup-first). Consider also making the admin `autoGenerateSeo` the default when meta is empty so this can't recur.

---

## 🔴 Critical (buyer / revenue / security)

### PAY-01 — Payment webhook still accepts cross-gateway confirmation (free-order fraud)
**Evidence:** `cart-checkout.service.js:2163-2166` still treats a `mock_online` webhook as valid for a `razorpay` attempt (and vice-versa):
```js
const gatewayMatch =
  attempt.gateway === normalizedGatewayCode ||
  (attempt.gateway === "razorpay" && normalizedGatewayCode === "mock_online") ||
  (attempt.gateway === "mock_online" && normalizedGatewayCode === "razorpay");
```
The mock gateway performs **no signature verification**.
**Impact:** Anyone who learns/guesses a pending `attemptId` can `POST /api/payments/webhook/mock_online` with `{ attemptId, status: "success" }` and have a **real Razorpay order marked paid without paying** → direct revenue loss / fraud. This was flagged in the earlier audit and is **still present**.
**Corrective action:** Remove the razorpay↔mock cross-match — a webhook may only confirm an attempt created for the *same* gateway. Disable the mock gateway + its webhook route entirely in production (`skip` unless non-production). Require and verify a signature on every real gateway webhook; reject unsigned webhooks in production.

### DURABILITY-01 — Flat-file store with unbounded, un-pruned arrays + whole-file rewrite (10-year killer)
**Measured on production `auth-store.json` (184 KB today):**
- `refreshSessions = 88` — **31 revoked (dead)**, 57 active. Revoked/expired sessions are **never pruned** → these are the stale "uncached tokens."
- `activityLogs = 237` and growing on every admin action — **no rotation/cap**.
- Transient arrays also accumulate without cleanup: `guestCarts`, `checkoutSessions`, `stockReservations`, `paymentAttempts`, `otpChallenges`.

**Why it's critical for 10 years:** every store is a single JSON file that is **rewritten in full on every mutation** (the atomic-write pattern rewrites the whole file). As these arrays grow, each login / order / admin action rewrites an ever-larger file → escalating latency, and the partial-write/corruption window (the cause of the earlier full wipeout) **reopens under load**. At current low traffic it's fine; over years it degrades and eventually breaks.
**Corrective action:**
1. **Now:** prune revoked/expired `refreshSessions`, cap `activityLogs` (keep last N / rotate to a separate append file), and prune completed/expired transient records. Script in **Appendix B** (this is the "clean the uncached tokens" the request refers to — safe, backup-first).
2. **This year:** migrate the catalog/auth/order data to a real database (PostgreSQL or MongoDB). This is the highest-leverage structural fix — nearly every durability and concurrency risk traces back to the flat-file design.

---

## 🟠 High

### MONEY-01 — Money is floating-point, mitigated by rounding (watch, don't panic)
`cart-checkout.service.js` computes prices/GST as JS numbers but rounds consistently (`roundMoney` = round to 2 dp with EPSILON, `Math.round` on the grand total, correct GST-inclusive reverse math at line 523-531). This avoids most float drift, so it is **not** currently mis-charging buyers. Still, storing money as float is fragile for a decade of edits/refunds/partial payments.
**Corrective action:** move money to **integer paise** in the DB migration; assert `sum(line totals) == order total` before creating an order or bank/settlement record.

### STORE-01 — Read-modify-write races on shared stores
Handlers read a whole store, mutate in memory, then write. The write mutex prevents file corruption but not **lost updates** (two concurrent product edits / two webhook deliveries can interleave; the second write overwrites the first). Razorpay retries webhooks aggressively, so the dedup check and the write are not atomic together.
**Corrective action:** wrap read→modify→write in a per-store async lock; add a unique constraint on `(gateway, eventId)` for webhooks (native once on a real DB).

### OBS-01 — No structured error logging
5xx errors aren't logged with stack/context, so diagnosing a buyer-facing failure or a failed order in production is guesswork. Add a logger (pino) capturing 5xx + request id + actor; keep 4xx at warn.

### UX-01 — No crash isolation in the storefront/admin
A single render error (a null field, an unexpected API shape) can white-screen the whole storefront (lost sale) or admin (ops outage). Add React ErrorBoundaries (top-level + around the checkout and product-editor screens) and guard API-derived data.

---

## 🟡 Medium

- **VAL-01 — metaDescription max(320) vs real content:** keep the 320 cap (SEO best practice) *after* DATA-01 repair; add server-side auto-truncation so a long paste can never 400 the whole save again.
- **INFRA-01 — VPS pressure:** disk ~85 %, swap ~97 % on the shared box. A full disk hard-fails JSON writes → corruption. Add disk/swap alerts, prune old `.corrupted.*`/`.tmp`/backup artifacts, and move builds off the production box.
- **BACKUP-01 — Verify off-server backups:** after the July wipeout, confirm the catalog/auth/order stores are backed up **off the VPS** on a schedule and that a restore has been tested. (Local `catalog-store.json` here is only 8 demo products — the real data lives only on the VPS.)
- **SEC-carryover:** the earlier audit's admin-password rotation and the general "no rate limit on some routes / helmet/CSP" items should be confirmed closed.

---

## ⚪ Low / hygiene

- Duplicate crawler folders (`scripts/migration` and `scripts/commmerce-crawler` — note the typo) and multiple push/restore scripts invite running the wrong one. Consolidate and document the canonical migration path.
- The admin `autoGenerateSeo` produces a correct 155-char meta — make it the fallback whenever `metaDescription` is empty so the field self-heals.

---

## Priority plan

**This week (stop live harm):**
1. `PAY-01` Remove razorpay↔mock webhook cross-match; disable mock gateway in production. *(Free-order fraud — highest live risk.)*
2. `DATA-01` Run the metaDescription repair (Appendix A) — fixes SEO **and** unblocks admin product saves.
3. `DURABILITY-01` Prune revoked/expired refresh sessions + cap activity logs (Appendix B — the token cleanup).

**This month:**
4. `OBS-01` structured logging; `UX-01` ErrorBoundaries; `STORE-01` per-store locks + webhook uniqueness.
5. `INFRA-01`/`BACKUP-01` disk/swap alerts + verified off-server backups.

**This year:**
6. Migrate off JSON flat files to a real database; money → integer paise (`MONEY-01`). Structural fix that retires most of the durability and concurrency risk for the 10-year horizon.

---

## What was checked and confirmed safe
- **No credential exposure:** Razorpay / payment-store credentials were **not** read, printed, or transmitted. All probes were count-only on product and session metadata.
- **No data loss from the "opus" incident:** all 382 product descriptions are intact; only the derived `metaDescription` field was polluted and is fully regenerable.

---

## Appendix A — metaDescription repair (safe, backup-first)

Run on the VPS from `VPS/`. It backs up the catalog store, then rewrites only `metaDescription` (≤155 chars, plain text) for every product; descriptions untouched. Dry-run first.

```js
// scripts/fix-meta-descriptions.js   —   node scripts/fix-meta-descriptions.js [--apply]
const fs = require("fs");
const path = require("path");
const P = path.resolve(process.cwd(), "backend/src/database/json/catalog-store.json");
const apply = process.argv.includes("--apply");
const store = JSON.parse(fs.readFileSync(P, "utf-8"));
const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
const snippet = (t) => { t = strip(t); return t.length <= 155 ? t : t.slice(0, 152).replace(/\s+\S*$/, "") + "…"; };
let changed = 0;
for (const p of store.products || []) {
  const next = snippet(p.shortDescription || p.fullDescription || p.metaTitle || p.title || "");
  if ((p.metaDescription || "") !== next) { if (apply) p.metaDescription = next; changed++; }
}
console.log((apply ? "APPLIED" : "DRY-RUN") + " — products needing meta fix: " + changed + " / " + (store.products || []).length);
if (apply) {
  fs.copyFileSync(P, P + ".bak-" + Date.now());
  const tmp = P + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(store, null, 2)); fs.renameSync(tmp, P);
  console.log("Saved. Backup written next to catalog-store.json. Restart backend if it caches.");
}
```

## Appendix B — token / log cleanup (safe, backup-first)

Prunes revoked/expired refresh sessions and caps activity logs. Dry-run first.

```js
// scripts/prune-auth-store.js   —   node scripts/prune-auth-store.js [--apply]
const fs = require("fs");
const path = require("path");
const P = path.resolve(process.cwd(), "backend/src/database/json/auth-store.json");
const apply = process.argv.includes("--apply");
const s = JSON.parse(fs.readFileSync(P, "utf-8"));
const now = Date.now();
const before = (s.refreshSessions || []).length;
const keptSessions = (s.refreshSessions || []).filter(x => !x.revokedAt && (!x.expiresAt || Date.parse(x.expiresAt) > now));
const LOG_KEEP = 1000;
const logsBefore = (s.activityLogs || []).length;
const keptLogs = (s.activityLogs || []).slice(-LOG_KEEP);
console.log("refreshSessions " + before + " -> " + keptSessions.length + " (removed " + (before - keptSessions.length) + " dead)");
console.log("activityLogs " + logsBefore + " -> " + keptLogs.length);
if (apply) {
  s.refreshSessions = keptSessions; s.activityLogs = keptLogs;
  fs.copyFileSync(P, P + ".bak-" + Date.now());
  const tmp = P + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, P);
  console.log("Saved. Backup written next to auth-store.json. Restart backend after.");
}
```
> Note: pruning revoked sessions only logs out already-dead sessions (no active user is affected). Schedule both as a periodic job so cleanup is automatic.
