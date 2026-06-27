# Storefront Plan

This file records the approved progressive plan for the storefront frontend and related ecommerce email work. It exists so the implementation can continue safely even if working context is lost.

## Scope Lock

- The approved client prototype is the visual source of truth for the storefront.
- The storefront must be mobile-first.
- Frontend work starts first.
- Email dispatch coding must not start until the delivery architecture is finalized and approved.

## Current Frontend Status

Already re-themed to the approved prototype style:

- Home
- Product listing / category listing
- Product detail
- Cart
- Checkout
- Order success / thank-you page
- Customer login / register / OTP
- Forgot password / reset password fallback
- Customer account dashboard
- Customer order detail
- Guides list
- Guide detail
- Recovery page
- Not-found page
- Shared storefront shell

Still needing final approved-theme work:

- Cross-page consistency and polish pass
- Responsive spacing review across the full storefront flow
- Final utility / empty / error state QA sweep

## Phase 1: Theme Contract And Shared Components

Freeze the storefront theme contract at component level, not only visual level.

### Design Tokens

- Colors
- Font sizes
- Spacing scale
- Border radius
- Shadows
- Button sizes
- Input heights
- Card style
- Mobile breakpoints
- Sticky bottom action pattern

### Shared Components To Confirm / Build

- `StorefrontButton`
- `StorefrontCard`
- `StorefrontInput`
- `StorefrontSelect`
- `StorefrontBadge`
- `StorefrontChip`
- `StorefrontAlert`
- `StorefrontEmptyState`
- `StorefrontLoadingState`
- `StorefrontErrorState`
- `StorefrontPageHeader`
- `StorefrontSectionHeader`
- `StorefrontStickyActionBar`

Also keep a reusable account/order table or list-detail pattern so account screens do not diverge visually.

## Mobile-First Rule

Every storefront page must be designed in this order:

1. 360px to 430px mobile width
2. Tablet
3. Desktop

Special focus areas:

- Cart
- Checkout
- Login / OTP
- Order detail
- Payment proof upload
- Invoice download
- Support contact

## Progressive Execution Order

### 1. Theme Contract + Shared Components

Build and freeze the storefront UI contract so later page work reuses components instead of duplicating CSS and markup patterns.

### 2. Main Revenue Flow

Re-theme and verify the main commercial flow first:

- Home
- Product detail
- Category / catalog listing
- Search results experience
- Cart
- Checkout
- Address selection
- Shipping method
- Payment method
- Payment state
- Order review state if present
- Order success / thank-you page

### 3. Auth / Account / Order Detail

Re-theme:

- Login
- Register
- OTP verification
- Account dashboard
- Invoices
- Tracking
- Saved products
- Addresses
- Support contact
- Manual payment proof upload
- Invoice download states
- Order detail timeline and reorder flows

### 4. Guides / Recovery / Utility Pages

Re-theme:

- Guides list
- Guide detail
- Recovery flow
- Empty states
- Error states
- Not-found style
- Remaining storefront utility screens

### 5. Final Storefront Consistency Pass

Dedicated polish pass across all storefront surfaces:

- Spacing
- Typography
- Icon rhythm
- Alerts
- Cards
- Form controls
- Sticky actions
- Loading / empty / error states
- Mobile behavior

## Order Success Page Requirements

The order success / thank-you page must include:

- Order number
- Payment status
- Expected dispatch or delivery info
- Download invoice if ready
- WhatsApp / support contact
- Continue shopping
- View order
- Bank transfer / pending payment instructions when applicable

## Email Work: Approval Gate

Do not start real email dispatch coding until the email delivery architecture is finalized and approved.

## Email Architecture Plan

### 6. Freeze Email Delivery Architecture

This phase must finalize:

- SPF
- DKIM
- DMARC
- Transactional sender domain
- Reply-to address
- Support mailbox
- Return-path / bounce handling
- Asset-hosting rules for email images
- Failed-send behavior
- Resend policy

### 7. Implement Provider Abstraction

Build a provider abstraction that supports:

- `PreviewProvider`
- `SMTPProvider`
- `APIProvider`

Recommended production provider options to evaluate first:

- Amazon SES
- Brevo
- Zoho ZeptoMail

SMTP may exist as fallback but should not be treated as the preferred long-term architecture by default.

Keep existing preview and notification logs.

## Email Templates Plan

### 8. Auth + Order / Payment Templates

Complete content and delivery coverage for:

- `customer_verification_email`
- `otp_login_code`
- `forgot_password`
- `login_success`
- `order_placed`
- `awaiting_payment`
- `payment_successful`
- `payment_failed`

### 9. B2B / Manual Payment / Fulfilment / Recovery Templates

Complete:

- `manual_payment_submitted`
- `manual_payment_verified`
- `dealer_order_request_received`
- `dealer_order_approved`
- `bulk_quote_received`
- `fulfilment_started`
- `order_dispatched`
- `tracking_detail_update`
- `ready_for_pickup`
- `self_pickup_completed`
- `order_delivered`
- `shipment_feedback`
- `refund_successful`
- `order_left_in_cart`
- `cart_reminder`
- `notify_when_available`

## Future Channel Readiness

Keep notification events generic so the same event can later support:

- Email
- WhatsApp
- SMS
- Push

Current implementation may still dispatch email only, but the event model should remain reusable.

## Trigger Audit Requirement

### 10. Produce Trigger Audit Report

The audit output must include a clear table with:

- Template name
- Trigger event
- Trigger file / function
- Variables required
- Variables available
- Status: `wired`, `content-only`, or `missing trigger`
- Test status

## Email QA Requirement

### 11. Email QA

QA must include:

- Gmail test
- Outlook test
- Business email inbox test
- Mobile email view
- Dark mode email view
- Broken image fallback
- Failed-send behavior
- Resend policy
- Bounce handling readiness
- Domain authentication readiness

Unsubscribe behavior must apply only to marketing / recovery emails, not transactional emails.

## Current Known Backend Email Status

Current notification templates and logs already exist in backend, but delivery is simulated until provider work is approved and implemented.

Known existing trigger wiring includes at least:

- `order_placed`
- `payment_failed`
- `manual_payment_submitted`
- `manual_payment_verified`
- `dealer_order_request_received`
- `dealer_order_approved`
- `ready_for_pickup`
- `self_pickup_completed`
- `tracking_detail_update`
- `notify_when_available`

This list must still be validated formally during the trigger audit phase.

## Working Rule

Implementation should continue in frontend phases first.

The next approved coding step after this document is:

1. Finish phase 1 shared storefront component contract
2. Refactor current storefront pages onto that shared layer where safe
3. Continue page-by-page from the approved execution order

## Progress Checkpoint

Completed in code:

- Shared storefront component layer created in `src/shared/storefront/storefront-ui.jsx`
- Theme contract tokens extended in `src/styles.css`
- Approved `ui-prototype/Front` theme re-audited against the live storefront before the latest styling pass
- Current prototype pages refactored onto shared components:
  - storefront home
  - product listing
  - product detail
  - cart
  - checkout
  - order success
  - customer login / register / OTP
  - forgot password / reset password fallback
  - customer account dashboard
  - account order detail
  - guides list
  - guide detail
  - recovery
  - not-found page
  - buyer lead section
- Checkout now redirects into the storefront order-success page
- Unknown storefront routes now render a branded 404 page instead of silently redirecting to home
- Mobile sticky action bars now cover the main storefront revenue and follow-up flow:
  - product detail
  - cart
  - checkout
  - order success
  - account order detail
- Recovery now has a sticky restore action bar for mobile follow-up flow
- Checkout address forms now use labeled shared inputs for better mobile clarity
- Payment proof upload now uses a shared themed file-input pattern instead of raw form markup
- Account order detail now uses the shared page-header and error-state pattern
- Customer fallback password-reset flow is now available from the login page through dedicated forgot/reset routes
- Guest checkout follow-up is now available through a dedicated storefront route backed by public checkout follow-up APIs
- Guest manual-payment proof submission is now available directly from the guest order follow-up screen
- Customer account addresses now support edit as well as add/delete in the same themed form flow
- Catalog category switching now preserves active query, sort, and availability filters across desktop and mobile
- Placeholder-style storefront fallback copy was replaced in key home, product, checkout, and order-success states
- Shared storefront chrome was tightened to match the approved prototype more closely:
  - darker header / checkout shell
  - smaller icon scale
  - denser buttons and inputs
  - stronger hover color changes
  - card hover lift on category, product, and guide cards
  - compact mobile-first category grid and filter badge treatment
  - centered success-state presentation for checkout success / guest follow-up
- Localhost preview now disables and clears the storefront PWA service worker so local audits do not keep showing stale cached UI after rebuilds

Current route coverage after this checkpoint:

- `/`
- `/products`
- `/categories/:slug`
- `/products/:slug`
- `/cart`
- `/checkout`
- `/checkout/success`
- `/orders/guest/:checkoutSessionId`
- `/guides`
- `/guides/:slug`
- `/account`
- `/account/forgot-password`
- `/account/reset-password`
- `/account/orders/:orderId`
- `/recover/:recoveryToken`
- `*` branded not-found route

Verified:

- `cmd /c pnpm run build:front` passed after the guest follow-up, address-edit, mobile catalog, and content-state cleanup work
- `cmd /c pnpm run build:front` also passed after the approved-prototype theme-alignment pass
- `cmd /c pnpm run check:backend` passed after adding the checkout follow-up backend flow
- Live preview checks passed:
  - backend health responded on `http://127.0.0.1:4100/health`
  - storefront preview responded on `/`, `/products`, `/products/:slug`, and `/orders/guest/:checkoutSessionId`
  - guest checkout follow-up API returned order data for a real smoke-created manual-payment session

Smoke limitation:

- Headless Chrome is installed locally, but browser DOM automation could not be completed in this environment because Chrome is failing crashpad startup under the current sandbox. The live preview and API route checks still passed.

Next recommended coding step:

1. Do a human visual pass in a normal desktop/mobile browser on cart, checkout, guest order follow-up, login, account, recovery, and guides
2. Tighten any issues found in that visual pass across mobile, tablet, and desktop
3. Keep email phases blocked until the provider and authentication plan is approved
