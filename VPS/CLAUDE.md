# Jenix Commerce — VPS Project Context

## What This Is
Full-stack B2B/B2C e-commerce platform for Jenix India (industrial equipment/IoT devices).
Monorepo in `VPS/` folder managed with pnpm workspaces.

## Tech Stack
- **Backend**: Node.js 20, Express 5.1.0, CommonJS (`require`/`module.exports`). Runs from VPS root.
- **Admin panel**: React 18, Vite, ESM (`import`/`export`), React Router v6. Port 5173 (dev).
- **Storefront**: React 18, Vite. Port 4174 (dev).
- **Database**: JSON flat-file stores in `backend/src/database/json/`. No MongoDB yet.
- **Package manager**: pnpm. Root `package.json` at `VPS/package.json` holds all backend deps.

## Key Commands
```
pnpm run dev:backend       # start backend (port 4100)
pnpm run dev:admin         # start admin panel (port 5173)
pnpm run build:admin       # build admin panel
pnpm run check:backend     # run regression checks (all API flows)
node scripts/seed-admin.js # seed super admin account
```

## Brand & UI Rules
- Brand red: `#E8231A` (BRAND constant in every page component)
- Dark sidebar: `#111827`
- Font: Inter
- **All admin UI uses inline styles** — no CSS class rewrites
- Never delete working features/UI without asking the user first
- Responsive pattern: `className="desktop-only"` / `className="mobile-cards"`

## Environment
- `.env` lives at `VPS/.env` (root level), loaded via `dotenv.config({ path: path.resolve(process.cwd(), ".env") })`
- Backend must be started from `VPS/` directory for path resolution to work
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are set (strong 256-bit values)
- `CORS_ORIGIN` comma-separated list of allowed frontend origins

## Backend Architecture
```
backend/src/
  app.js                    # Express app factory — helmet, CORS (origin whitelist), morgan, express.json (with rawBody capture), routes
  server.js                 # HTTP server entry point
  config/env.js             # All env vars with defaults
  database/
    json/                   # Flat JSON file stores (runtime data)
    auth-store.js           # Customers, admins, sessions, cart, checkout, orders, payment attempts
    catalog-store.js        # Products, categories, HSN tax
    payment-store.js        # Gateway configs, credentials, manual payment submissions
    shipping-store.js       # Courier profiles, shipments
  modules/
    auth/                   # JWT auth, OTP, customer/admin login
    products/               # CRUD, bulk ops, image upload
    customers/              # B2B approval, manual payments
    cart-checkout/          # Cart, checkout, payment attempts, webhooks
    payment-gateways/       # Admin CRUD for gateway config
    setup-wizard/           # Guided onboarding (all settings in one place)
    orders/                 # Order management
    invoices/               # PDF invoice generation
    shipping/               # Courier tracking
    hsn-tax/                # GST rate master
  integrations/
    payment-gateways/
      payment-gateway.adapter.js   # Factory: createPaymentGateway(code)
      razorpay.gateway.js          # REAL Razorpay SDK — reads creds from payment-store at runtime
      cashfree.gateway.js          # REAL Cashfree API (fetch, CF API v2023-08-01)
      mock-online.gateway.js       # Mock for testing (mock_online / mock codes)
      manual-upi.gateway.js
      bank-transfer.gateway.js
```

## Payment Gateway Architecture
Credentials are stored in `payment-store.json` and entered via:
1. **Setup Wizard** (`/setup-wizard`) — for Razorpay: keyId/keySecret/webhookSecret
2. **Payment Gateways admin page** (`/payment-gateways`) — all gateways, smart labeled fields

**Razorpay credential keys**: `keyId`, `keySecret`, `webhookSecret`
**Cashfree credential keys**: `appId`, `secretKey`, `webhookSecret`

Gateway is instantiated with `new RazorpayGateway()` / `new CashfreeGateway()` — no constructor args — they call `readPaymentStore()` internally at request time.

Both gateways **fall back to mock behavior** when credentials are not yet configured (so app doesn't crash before admin enters keys). Once keys are entered, they make real API calls.

## Rate Limiting
`express-rate-limit` installed. Three limiters in `app.js`:
- **loginLimiter** (20/15min): admin/login, customer/login, customer/register, customer/password, checkout
- **otpLimiter** (5/15min): customer/otp
- **apiLimiter** (300/min): all /api routes
All use `skip: () => env.nodeEnv !== "production"` — **off in dev, on in production**.

## SMTP Email
`nodemailer` installed. `backend/src/integrations/email-providers/smtp.provider.js` handles sending.
`marketing.service.js → sendTemplateNotification` checks `settings.setupWizard.smtpEmail` for configured SMTP (host + username + password + fromEmail). If set: real email sent, status = `"sent"` or `"failed"`. Otherwise: `"simulated_sent"`.
Setup Wizard now saves SMTP password in `settings.setupWizard.smtpEmail.password`.
Admin configures via: Setup Wizard → SMTP Email.

**Webhook raw body**: `express.json()` uses a `verify` callback saving `req.rawBody = buf`. The webhook controller reads `req.rawBody` + `x-razorpay-signature` / `x-webhook-signature` and passes them to the gateway for HMAC verification.

**Webhook route**: `POST /api/payments/webhook/:gateway`

## Admin Panel Module Locations
```
apps/admin-panel/src/modules/
  products/          products-page.jsx      — full CRUD, bulk ops, toggle active, clone, archive
  customers/         customers-page.jsx     — B2B approval, manual payment verify, WA link
  orders/            orders-page.jsx
  catalogue/         catalogue-page.jsx     — overview with export/import
  categories/        categories-page.jsx
  hsn-tax/           hsn-tax-page.jsx
  payment-gateways/  payment-gateways-page.jsx   — smart credential forms (Razorpay/Cashfree labeled fields)
  setup-wizard/      setup-wizard-page.jsx  — all-in-one setup (business profile, SMTP, GST, payment, shipping...)
  dashboard/         dashboard-page.jsx
  invoices/          invoices-page.jsx
  shipping/          shipping-page.jsx
  inventory/         inventory-page.jsx
  walkin-orders/     walkin-orders-page.jsx
  discounts/         discounts-page.jsx
  activity-logs/     activity-logs-page.jsx
  reports/           reports-page.jsx
  staff/             staff-page.jsx
  seo/               seo-page.jsx
  google-merchant/   google-merchant-page.jsx
  facebook-feed/     facebook-feed-page.jsx
  settings/          settings-page.jsx
  integrations/      integrations-page.jsx
```

## Regression Checks
`pnpm run check:backend` runs a full end-to-end API test suite covering:
- Product CRUD, bulk ops, images
- Category management
- Customer auth, B2B approval, manual payments
- Cart (guest + customer), checkout, stock reservation
- Payment attempts for mock_online and razorpay gateways
- Webhook processing, duplicate event deduplication
- Admin auth, setup wizard, all admin APIs
- Orders, invoices, shipping
- Search, activity logs

Always run this after backend changes to confirm nothing broke.

## Deployment Target
VPS (Ubuntu), Nginx reverse proxy, PM2 process manager.
Setup scripts in `VPS/scripts/`. Config: `VPS/ecosystem.config.cjs` for PM2.

---

## CRITICAL CODING RULES (must always follow)

1. **NEVER delete old code** — only add new code or comment out old code. Claude has a known bug where it removes working code while writing new code. Only clean up commented code after the user confirms delivery is final.

2. **Keep pages and components small and independent** — fixing one component must not break another. If a file is getting large (>200 lines), split it before adding more. Each page is its own file, one concern per file, backend routes stay thin.

---

## Production Environment

**VPS IP**: 154.61.69.200
**Project path on VPS**: `/root/projects/jenixindia`
**SSH access**: `plink root@154.61.69.200` (password: `***REMOVED***`) via `"D:\plink_git.bat"`

**Live URLs**:
- Admin panel: `https://admin.jenixindia.com`
- API: `https://api.jenixindia.com`
- Storefront (test): `https://test.jenixindia.com`

**PM2 process**: `jenix-backend` (id 28), port 4100

**After .env changes**: always restart with `pm2 restart jenix-backend --update-env` — plain `pm2 restart` does NOT pick up new env vars.

**After admin panel code changes**: rebuild with `pnpm run build:admin` then copy `apps/admin-panel/dist` to VPS.

### VPS .env (production values)
```
NODE_ENV=production
CORS_ORIGIN=https://test.jenixindia.com,https://admin.jenixindia.com
UPLOAD_DIR=image-assets/uploads
MIGRATION_IMAGES_DIR=image-assets/migration
SUPER_ADMIN_EMAIL=admin@jenixindia.com
SUPER_ADMIN_PASSWORD=***REMOVED***!
API_BASE_URL=https://api.jenixindia.com/api
JWT_ACCESS_SECRET=<generated 256-bit value>
JWT_REFRESH_SECRET=<generated 256-bit value>
```
> JWT secrets are generated once by `scripts/generate-env.js`. Do NOT run `generate-env.js` again on the same VPS — it regenerates secrets and invalidates all existing JWT tokens, causing every user to be logged out.

### Nginx config
Config: `/etc/nginx/sites-available/jenix-test.conf` (symlinked to sites-enabled).
Three server blocks: test.jenixindia.com (storefront), admin.jenixindia.com (admin panel), api.jenixindia.com (proxy to port 4100). All with SSL via Let's Encrypt.
Certbot: installed via snap (`snap install --classic certbot`). Cert covers all 3 domains, expires 2026-09-26.

### Image assets folder
All uploads: `image-assets/uploads/` (relative to `VPS/` project root)
Migration images: `image-assets/migration/`
This folder is gitignored (content only; `.gitkeep` files are tracked). To move to another VPS, copy the entire `image-assets/` folder.
Dev `.env` overrides to: `UPLOAD_DIR=backend/uploads`, `MIGRATION_IMAGES_DIR=scripts/migration/output`

---

## Known Issues Fixed

### AuthGuard infinite loop → auto-logout
**Symptom**: Auto-logout a few seconds after login with 429 errors.
**Root cause**: `useEffect` in `auth-guard.jsx` had `session` in its dependency array. Calling `setSession({...session, admin})` inside the effect changed `session`, which re-triggered the effect, creating an infinite loop of `adminMe()` calls until the 300/min rate limit hit and caused logout.
**Fix**: Use `sessionRef.current` inside the effect instead of `session` directly. Changed deps to `[isAuthenticated]` only — effect only re-runs on login/logout, not on session object updates. Also added guard: only call `setSession` if `!currentSession.admin` (prevents double-update).

### sharp module crashes backend
**Symptom**: Backend crashes at startup: "Unsupported CPU: requires v2 microarchitecture"
**Root cause**: VPS CPU doesn't support AVX2; sharp prebuilt binaries require x86-64-v2.
**Fix**: Made sharp a graceful optional dependency in `common/image-utils.js`. Image uploads work, but skip WebP conversion (original file served instead).

### certbot UnicodeDecodeError
**Root cause**: Old apt-installed certbot (Python 3.8) choked on non-UTF-8 bytes in another nginx config (`floodguard-api`).
**Fix**: Installed certbot 5.6.0 via snap.

### CORS blocked on admin login
**Symptom**: "No 'Access-Control-Allow-Origin' header" error in browser.
**Root cause**: PM2 was running with stale env — `CORS_ORIGIN` still had the old subdomain. `.env` was updated but `pm2 restart` without `--update-env` doesn't reload it.
**Fix**: `pm2 restart jenix-backend --update-env`

### vite-plugin-pwa fails on Node 18
**Symptom**: `Dynamic require of "workbox-build" is not supported` during `pnpm run build:admin`
**Fix**: Upgraded VPS to Node 20 via NodeSource. Symlinked `/usr/local/bin/node → /usr/bin/nodejs`.

### Non-SSL nginx block missing listen directive
**Root cause**: Original `render-nginx-config.js` always created two server blocks (redirect + content) even in non-SSL mode; the content block had no `listen` directive.
**Fix**: Rewrote `serverBlock()` — non-SSL = single block with `listen 80;`; SSL = two blocks.

---

## Payment Gateways — Configuration

Enter credentials via Admin panel → Payment Gateways, or via Setup Wizard.

**Razorpay fields**: `keyId`, `keySecret`, `webhookSecret`
**Webhook URL**: `https://api.jenixindia.com/api/payments/webhook/razorpay`

**Cashfree fields**: `appId`, `secretKey`, `webhookSecret`
**Webhook URL**: `https://api.jenixindia.com/api/payments/webhook/cashfree`

Gateways fall back to mock behavior when credentials are not configured — the app won't crash before keys are entered. Once keys are saved in `payment-store.json`, real API calls are made.

Credentials are stored at runtime in `backend/src/database/json/payment-store.json` (not committed to git).

---

## Pending Tasks

- [ ] MongoDB product import — CSV exists locally; needs hsnCode/gstRate filled, then import
- [ ] 301 redirects — When switching from old jenixindia.com to new site, set up 301s for all old product URLs
- [ ] Change admin password — Production still uses `***REMOVED***!`; change via Staff page
- [ ] SMTP email — Configure SMTP via Setup Wizard (host, username, password, fromEmail)
- [ ] Phone OTP via SMS — Not yet implemented (optional MVP feature)
