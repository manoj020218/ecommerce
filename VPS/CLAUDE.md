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
