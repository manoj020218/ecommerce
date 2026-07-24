# Jenix Commerce — Technical Audit Report

**Scope:** Full-stack audit of the `VPS/` monorepo (Node/Express backend, React admin panel, React storefront, JSON flat-file data layer, VPS/Nginx/PM2 deployment).
**Objective:** Identify every plausible way this system can crash, corrupt data, be exploited, or degrade over the next ~10 years — at UI/UX, API, backend, data, and infrastructure levels — with professional corrective actions.
**Date:** 2026-07-08
**Auditor:** Automated code review (Claude)

> **How to read this:** Findings are grouped by severity. Each has an ID (e.g. `SEC-01`), the concrete evidence (file/line), the realistic failure it causes, and a corrective action. The **Priority Remediation Plan** at the bottom sequences the fixes.

---

## Severity summary

| Severity | Count | Theme |
|---|---|---|
| 🔴 Critical | 8 | Secrets in git, auth bypass paths, payment confirmation bypass, single-disk data with no DB, silent crashes |
| 🟠 High | 7 | No error logging, no UI crash isolation, manual deployment drift, EOL OS, oversized components |
| 🟡 Medium | 8 | Timing-safe compares, token storage, webhook replay window, validation gaps |
| ⚪ Low / hygiene | 5 | Logging noise, dead code, missing per-route limits |

The single largest structural risk is the **JSON flat-file "database"** (see `DATA-01`). Nearly every data-durability and concurrency finding traces back to it. Migrating to a real database is the highest-leverage action in this report and already caused one full data-loss incident (Jul 2026).

---

## 🔴 Critical findings

### SEC-01 — VPS root SSH password committed to the git repository
**Evidence:** `.claude/settings.local.json` and `VPS/CLAUDE.md` (both git-tracked) contain the production VPS root password `[REDACTED — rotated & purged]` and embed it in `pscp -pw` / `plink -pw` commands.
**Impact:** Anyone with repo access (or a leaked clone, a fork, a CI cache, a laptop backup) has **root on the production server hosting 19+ apps**. This is the most severe issue in the report. A leaked password to a root account is a total-compromise event: data theft, ransomware, pivoting to the other tenants (billing-platform, edgefolio, qrunlock, etc.).
**Corrective action:**
1. **Rotate the VPS root password immediately** and, better, disable password SSH auth entirely (`PasswordAuthentication no`) in favor of SSH keys.
2. Purge the secret from git history (`git filter-repo` or BFG), then force-push and invalidate old clones.
3. Add a secret-scanning pre-commit hook (e.g. `gitleaks`) so credentials can never be committed again.
4. Never pass passwords as CLI args (they leak into shell history, process lists, and `settings.local.json`). Use key-based auth.

### SEC-02 — Admin password stored in a tracked file and is weak/shared
**Evidence:** `VPS/CLAUDE.md` documents `SUPER_ADMIN_PASSWORD=[REDACTED-ADMIN-PW]!` as the live production value; it is committed.
**Impact:** The super-admin login is public to anyone reading the repo. `admin.jenixindia.com` is one credential away from full commerce takeover (prices, orders, customer PII, payment configs).
**Corrective action:** Rotate the admin password now, store only in the VPS `.env` (already gitignored), and remove the literal from `CLAUDE.md`. Enforce a strong-password policy and, ideally, 2FA for admin logins.

### SEC-03 — Header-auth fallback is a complete authentication bypass when enabled
**Evidence:** `backend/src/middlewares/request-context.js:64-76` — when `ALLOW_HEADER_AUTH_FALLBACK=true`, any request carrying `x-admin-id` + `x-admin-role: super_admin` is treated as an authenticated super admin, with **no signature, no token, no verification**.
**Impact:** It is env-gated (off by default), but it is a live landmine: one mistaken `.env` line in production turns the entire admin API into an open door. `curl -H "x-admin-id: 1" -H "x-admin-role: super_admin" …` would grant full access.
**Corrective action:** Delete this fallback path entirely, or hard-gate it to `nodeEnv !== "production"` in code (not just via env). Header-based identity trust must never be reachable in production regardless of env configuration.

### SEC-04 — Weak default JWT secrets allow token forgery if env fails to load
**Evidence:** `backend/src/config/env.js:17-18` — `jwtAccessSecret` / `jwtRefreshSecret` fall back to the public string `dev_access_secret_change_me`. `token-service.js` signs with whatever `env` provides.
**Impact:** If the `.env` fails to load (wrong CWD, PM2 restart without env, path change), the backend silently signs and accepts JWTs using a **secret published in the source code**. An attacker can then forge a valid super-admin access token offline.
**Corrective action:** Fail fast on boot: if `NODE_ENV==="production"` and either secret equals the dev default (or is < 32 bytes), `throw` and refuse to start. Never ship a real fallback secret.

### PAY-01 — Payment webhook accepts cross-gateway confirmation (mock can confirm a real order)
**Evidence:** `backend/src/modules/cart-checkout/cart-checkout.service.js:2163-2169` explicitly treats `attempt.gateway === "razorpay"` and `webhook gateway === "mock_online"` as a match (and vice-versa). The mock gateway's `handleWebhook` performs **no signature verification**.
**Impact:** An attacker who learns/guesses a pending `attemptId` can call `POST /api/payments/webhook/mock_online` with `{ attemptId, status: "success" }` and have a **real Razorpay order marked paid without paying**. This is direct revenue loss / fraud.
**Corrective action:**
1. Remove the razorpay↔mock cross-match. A webhook must only confirm attempts created for the *same* gateway.
2. Disable the mock gateway and its webhook route entirely in production (`skip` unless `nodeEnv !== "production"`).
3. Require and verify a signature on *every* real gateway webhook (Razorpay/Cashfree already do — see `PAY-02` for the compare weakness); reject unsigned webhooks outright in production.

### DATA-01 — No real database: all production data lives in JSON files on a single disk, untracked
**Evidence:** `backend/src/database/*.js` read/write 11 flat JSON files under `backend/src/database/json/`, which are gitignored (only `.gitkeep` tracked). Products, orders, customers, payments, invoices all live here. CLAUDE.md confirms "No MongoDB yet."
**Impact:** This is the root cause of the Jul 2026 full-catalog wipeout. Structural consequences that will bite harder as the business grows:
- **No durability guarantee** — a disk failure, a bad deploy, or a truncated write loses everything. The only copy is one VPS disk (currently 83% full).
- **O(n) writes** — every single product/order mutation serializes and rewrites the *entire* store file. At 382 products it's fine; at 10k products with rich descriptions, each edit rewrites megabytes and write latency grows linearly, eventually timing out requests.
- **No indexes, no queries, no transactions** — every lookup is a full in-memory scan.
- **No multi-process safety** — if PM2 ever runs the backend in cluster mode, two workers writing the same file corrupt it instantly (the in-process mutex does not span processes).
**Corrective action:** Plan a migration to a real database (PostgreSQL recommended for relational commerce data; MongoDB is already anticipated). Interim hardening: (a) automated off-server backups (see `INFRA-01`), (b) keep the atomic-write + mutex fix (already applied), (c) never enable PM2 cluster mode while on flat files.

### DATA-02 — Read-modify-write races cause lost updates and double webhook processing
**Evidence:** The write mutex in `catalog-store.js:51-64` (and siblings) serializes *writes* but not *read→modify→write cycles*. E.g. `processPaymentWebhook` (`cart-checkout.service.js:2104-2119`) reads three stores, mutates in memory, and writes at the end. Two concurrent requests both read the pre-change state; the second write silently overwrites the first.
**Impact:**
- Two admins editing different products at once → one edit is lost.
- Razorpay retries webhooks aggressively; two concurrent deliveries of the same event can both pass the `processedWebhooks` dedup check (the check and the write are not atomic) → **double order creation / double stock release**.
**Corrective action:** Short term — extend the mutex to cover the whole read-modify-write critical section per store (an async lock around the operation, not just the file write). Long term — a real DB with row-level locking / unique constraints on `(gateway, eventId)` makes this class of bug structurally impossible.

### STAB-01 — No process-level crash handlers; the backend dies on any unhandled async error
**Evidence:** `backend/src/server.js` has no `process.on("uncaughtException")` or `process.on("unhandledRejection")`. There is no global safety net outside Express's error middleware.
**Impact:** An unhandled rejection in any timer, event emitter, stream, or background task (not on the Express request path) crashes the entire Node process. PM2 restarts it, but in-flight requests are dropped and the app flaps. Over 10 years of dependency and code churn, this *will* be hit repeatedly.
**Corrective action:** Add top-level handlers in `server.js` that log the error (see `OBS-01`) and exit gracefully so PM2 restarts cleanly. Wrap the HTTP server with a graceful-shutdown routine (drain connections on `SIGTERM`).

---

## 🟠 High findings

### OBS-01 — Backend has no error logging; 500s vanish silently
**Evidence:** `backend/src/middlewares/error-handler.js:7-17` returns a generic 500 but never logs the error. There is no logging library (no winston/pino) and zero `console.error` in `backend/src` outside the regression script. `morgan("dev")` logs only request lines to stdout.
**Impact:** When something breaks in production, there is **no stack trace, no error record, nothing to debug with**. Root-causing an incident becomes guesswork. This compounds every other finding — you can't fix what you can't see.
**Corrective action:** Introduce a structured logger (pino). Log every 5xx with stack, request id, route, and actor. Ship logs to a file (rotated) or a log service. Keep 4xx at info/warn level.

### UX-01 — No React ErrorBoundary; a single render error white-screens the whole app
**Evidence:** No `ErrorBoundary` / `componentDidCatch` / `getDerivedStateFromError` anywhere in `apps/*/src` (only inside bundled vendor code).
**Impact:** Any uncaught render error in *any* component (a null field, a bad API shape, a map over undefined) blanks the **entire** admin panel or storefront — not just the broken widget. For a commerce site, a white storefront is lost revenue; a white admin panel is an operations outage.
**Corrective action:** Add a top-level `ErrorBoundary` in both apps that renders a fallback UI and reports the error, plus per-route boundaries so one failing page doesn't kill navigation. Defensively guard API-derived data (`?.`, default arrays).

### DEP-01 — Manual, per-file deployment causes silent drift between git and the VPS
**Evidence:** Deployment is `git fetch` + `git checkout origin/main -- <individual files>` executed by hand over SSH. Today's session hit **three consecutive build failures** on the VPS purely from drift: `products-column-selector.jsx`, `edit-product-page.jsx`, and `categories.api.js`'s `uploadCategoryImage` export were all missing on the server because earlier deploys checked out files one-by-one and forgot dependencies.
**Impact:** The VPS working tree and `origin/main` are chronically out of sync. Deploys are error-prone, non-reproducible, and can leave the site in a half-updated (broken) state. This will keep causing outages.
**Corrective action:** Adopt a real deploy flow: on the VPS, `git fetch && git reset --hard origin/main` for the app tree (after moving genuinely VPS-local files — `.env`, `image-assets/`, JSON stores — outside the tree or into gitignored paths). Better: a CI pipeline (GitHub Actions) that builds and rsyncs `dist/` on merge to `main`. One command, whole tree, reproducible.

### DEP-02 — Node version drift breaks builds on the server
**Evidence:** The VPS `nvm` default was Node 18, which fails `build:admin` with `Dynamic require of "workbox-build" is not supported` (vite-plugin-pwa needs Node 20). This session had to `nvm install 20` mid-deploy.
**Impact:** Whichever shell/user triggers a build may silently be on the wrong Node, producing a broken or absent build. Non-deterministic deploys.
**Corrective action:** Pin the Node version with an `.nvmrc` (already Node 20 target) and enforce it in `package.json` `engines`. Have PM2 and any deploy script explicitly `nvm use` the pinned version. In CI, use `actions/setup-node` with the pinned version.

### MAINT-01 — Oversized components violate the project's own size rule and drive regressions
**Evidence:** `products-page.jsx` is **2,785 lines** (plus `shipping-page.jsx` 1,682, `integrations-page.jsx` 1,364, several others >1,000). `VPS/CLAUDE.md` mandates splitting files before they exceed ~200 lines.
**Impact:** Directly caused today's `import`-after-`const` build break in `products-page.jsx` (line 23) — an error that's easy to miss in a 2,785-line file. Large files raise merge-conflict risk, slow review, and make "fixing one thing breaks another" (the exact failure mode the project rules warn about).
**Corrective action:** Decompose the largest pages into feature sub-components (form, list, filters, modals, API hooks) per the existing rule. Add an ESLint `max-lines` rule (e.g. warn at 400) to prevent regrowth.

### INFRA-01 — No verified off-server backups of the JSON data
**Evidence:** `scripts/backup.sh` shells into `backup-runner.js`, but there is no evidence of a scheduled cron job or an *off-server* copy. The Jul 2026 wipeout summary explicitly notes "No VPS snapshots or backups existed."
**Impact:** Given `DATA-01` (single-disk, untracked data), the absence of tested backups means any data-loss event is unrecoverable. This already happened once.
**Corrective action:** Schedule `backup.sh` via cron (e.g. hourly), write to a **different host / object storage** (S3-compatible), retain a rolling window, and **test restores** quarterly. Verify the runner actually captures all 11 stores + `image-assets/`.

### INFRA-02 — EOL operating system, exhausted swap, and filling disk
**Evidence:** SSH banners this session: Ubuntu 20.04 LTS reached end of standard support 2025-05-31; swap usage hit **100%**; disk at **83.8%** of 48 GB.
**Impact:** EOL OS = no security patches (growing vulnerability surface). 100% swap = memory pressure and OOM-kill risk during builds (builds already compete with 19 PM2 apps on this box). A full disk will hard-fail writes — including JSON-store writes, which corrupts data.
**Corrective action:** Plan an OS upgrade to a supported LTS (22.04/24.04). Add disk-usage and swap alerting. Move builds off the production box (build in CI, ship artifacts). Increase RAM/swap or reduce co-tenancy. Set a disk-cleanup policy for logs and old `.corrupted.*`/`.tmp` artifacts.

---

## 🟡 Medium findings

### PAY-02 — Webhook signature comparison is not timing-safe
**Evidence:** `razorpay.gateway.js:75` and `cashfree.gateway.js` compare HMACs with `expected !== signature` (plain string compare).
**Impact:** Theoretically leaks signature bytes via timing side-channel. Low practical risk but trivially fixable and standard practice.
**Corrective action:** Use `crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))` with a length guard.

### PAY-03 — Webhook signature is only enforced *if* a secret is configured
**Evidence:** `razorpay.gateway.js:72` — signature is verified only `if (webhookSecret && signature && rawBody)`. If the webhook secret isn't set, the webhook is accepted unverified.
**Impact:** A misconfiguration (secret not entered in Setup Wizard) silently downgrades to "trust any caller," enabling forged payment confirmations.
**Corrective action:** In production, refuse to process gateway webhooks when the corresponding secret is unset — respond 503 and alert, rather than accepting unsigned events.

### SEC-05 — JWTs stored in `localStorage` (both apps)
**Evidence:** `apps/front/src/shared/api/http-client.js:45`, `apps/front/src/shared/auth/customer-session.jsx`, `apps/admin-panel/src/modules/auth/auth.store.js:17-47`.
**Impact:** Any XSS (e.g. via a rich-text/description field rendered as HTML) can read the token from `localStorage` and hijack the session. The admin panel renders product descriptions as HTML, widening the XSS surface.
**Corrective action:** Prefer httpOnly, Secure, SameSite cookies for the session token so JS can't read it. At minimum, sanitize all user/admin-supplied HTML before render (DOMPurify) and set a strict Content-Security-Policy.

### VAL-01 — Rich-text/description fields are stored and rendered as raw HTML
**Evidence:** `RichTextEditor` emits `innerHTML`; product `shortDescription`/`fullDescription` limits were just raised to 50,000 chars and are rendered in admin/storefront.
**Impact:** Stored-XSS vector: a crafted description (`<img onerror=…>`) executes in any admin/customer browser that views the product. Combined with `SEC-05`, that means session theft.
**Corrective action:** Sanitize HTML on input (server-side) and on render (DOMPurify). Whitelist allowed tags/attributes. This is the single most important web-security fix after the credential rotation.

### RL-01 — Webhook endpoints share the generic 300/min limiter and have no replay throttle
**Evidence:** `app.js:120` applies `apiLimiter` to `/api` broadly; there's no dedicated protection on `/api/payments/webhook/:gateway`.
**Impact:** The dedup table (`processedWebhooks`) grows unbounded and an attacker can hammer webhook endpoints to probe `attemptId`s (see `PAY-01`) within the generous limit.
**Corrective action:** Add a stricter, separate limiter for webhook routes, cap/prune `processedWebhooks`, and enforce signature-first (reject before doing any store reads).

### STAB-02 — Rejected CORS origins surface as 500 errors
**Evidence:** `app.js:30-33` throws `new Error(...)` for disallowed origins; the error handler maps unknown errors to 500.
**Impact:** Legitimate misconfig (a new subdomain) looks like a server crash in logs/monitoring, masking real 500s and confusing debugging.
**Corrective action:** Respond with a clean 403 for disallowed origins instead of throwing into the 500 path.

### VAL-02 — Unbounded array/string inputs across validators
**Evidence:** Several Zod schemas accept large arrays and strings (e.g. `fullDescription` up to 100,000 chars, `specifications` as free-form record). The 1 MB JSON body limit is the only backstop.
**Impact:** Large payloads bloat the single JSON store file (amplifying `DATA-01`'s O(n) write cost) and can be used to degrade performance.
**Corrective action:** Tighten per-field limits to realistic maximums; validate `specifications` key/value counts and sizes; keep the smallest body limit each route actually needs.

### OTP-01 — Predictable dev OTP and default super-admin fallback in shared config
**Evidence:** `env.js:59` `OTP_DEV_DEFAULT_CODE = "123456"`; `env.js:23` `superAdminPassword` default `ChangeMe@123`.
**Impact:** If dev defaults ever leak into a production-like environment, OTP and admin auth are trivially guessable.
**Corrective action:** Gate the dev OTP strictly to non-production and assert it's unused in prod at boot; never allow the admin-password default to take effect in production (fail fast).

---

## ⚪ Low / hygiene findings

### HYG-01 — `morgan("dev")` in production
Verbose, colorized, unpersisted request logging is meant for development. Replace with a production format written to rotated files (pairs with `OBS-01`).

### HYG-02 — Accumulating commented-out / dead code
The project rule "never delete, only comment out" is pragmatic for safety but, without a cleanup pass after confirmed-stable releases, dead code accumulates and obscures logic. Schedule periodic cleanups once a feature is verified live.

### HYG-03 — Leftover `.tmp` / `.corrupted.*` store artifacts
The atomic-write and corruption-backup paths create `*.tmp` and `*.corrupted.<ts>` files. Without cleanup they consume the already-tight disk (`INFRA-02`). Add a retention/cleanup job.

### HYG-04 — No automated test gate before deploy
Regression checks exist (`pnpm run check:backend`) but aren't enforced in a pipeline. A broken build reached the VPS three times today. Run checks + build in CI and block deploy on failure.

### HYG-05 — No dependency-vulnerability scanning
No evidence of `pnpm audit` / Dependabot. Over 10 years, transitive CVEs are inevitable. Enable automated dependency scanning and a monthly patch cadence.

---

## Priority remediation plan

**Do this week (stop-the-bleeding, mostly security):**
1. `SEC-01` Rotate VPS root password, switch to SSH keys, purge from git history, add gitleaks. *(Highest priority — root compromise risk.)*
2. `SEC-02` Rotate admin password, remove from `CLAUDE.md`.
3. `PAY-01` Remove razorpay↔mock cross-match; disable mock gateway/webhook in production.
4. `SEC-03` Remove/hard-gate the header-auth fallback.
5. `SEC-04` Fail-fast on default JWT secrets in production.
6. `VAL-01`/`SEC-05` Sanitize stored HTML (DOMPurify) — closes the stored-XSS → session-theft chain.

**Do this month (durability & visibility):**
7. `INFRA-01` Scheduled, off-server, tested backups.
8. `OBS-01` Structured logging for all 5xx.
9. `STAB-01` Process-level crash handlers + graceful shutdown.
10. `UX-01` React ErrorBoundaries in both apps.
11. `DEP-01`/`DEP-02` Reproducible deploy (whole-tree reset or CI) + pinned Node.

**Do this quarter (structural):**
12. `DATA-01`/`DATA-02` Migrate off JSON flat files to PostgreSQL/MongoDB with proper transactions, indexes, and unique constraints on webhook event IDs.
13. `INFRA-02` OS upgrade off EOL Ubuntu; capacity (RAM/disk); move builds to CI.
14. `MAINT-01` Decompose oversized components; add `max-lines` lint.
15. Remaining Medium/Low items as normal backlog.

---

## Positive notes (what's already solid)

- The **atomic-write + write-queue mutex** fix (post-wipeout) correctly prevents file *corruption* and is the right interim mitigation.
- Corruption now **preserves a `.corrupted.<ts>` backup and throws** instead of silently overwriting — exactly the right recovery posture.
- Webhook **idempotency** via `processedWebhooks` is present (needs the atomicity fix in `DATA-02`, but the intent is correct).
- Real gateway webhooks (Razorpay/Cashfree) **do** perform HMAC verification when a secret is set.
- Rate limiting exists on the sensitive auth/OTP/checkout routes.
- Helmet, CORS whitelisting, and per-actor JWT scoping are in place — a reasonable baseline to build on.
