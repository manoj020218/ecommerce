# Jenix Commerce PROJECT.md

## 0. Purpose

Build a professional, modular, mobile-first, PWA-ready owned e-commerce platform for **Jenix India** to replace the current website-builder based e-commerce site.

The platform must support:

- 500+ products
- ~200 orders/month initially
- Public product catalogue
- Buyer-intent search in English, Hindi, and Hinglish
- GST invoice generation
- Tally export
- Cart-level shipping calculation
- Multiple payment gateways
- Manual bank transfer / UPI payment verification
- Customer profile with order history, tracking, invoice download
- Dealer / stockist B2B workflow later
- Blog / knowledge base
- Google Merchant / Shopping feed
- Facebook product feed later
- Reports
- Marketing templates and offers
- Staff permissions
- Setup wizard and installer scripts so the same platform can later be sold to other businesses

This document is the master context for Codex. Keep it updated as work progresses.

---

## 1. Golden Rules for Codex

1. Do not hallucinate unavailable integrations. If a provider API is not implemented yet, create adapter interface and mark it `TODO`.
2. Do not hard-code Razorpay, Shiprocket, Google, or any one provider into business logic.
3. Use adapter/service pattern for payment, shipping, OTP, email, analytics, and feed generation.
4. Keep project modular. Every backend module must have routes, controller, service, model, validator, and tests/checklist.
5. Both customer front and admin panel must be mobile-first and PWA-ready.
6. Do not show exact stock quantity to customers. Stock is private backend information.
7. Do not include shipping cost inside product price. Shipping must be transparent and cart-level.
8. GST invoice must be generated only after confirmed payment or admin-verified manual payment.
9. Customer search history, cart history, and personal data must be private to the logged-in user.
10. Do not force login before browsing, searching, or adding to cart.
11. Always preserve old product URLs during migration for redirects.
12. Every phase must include regression tests before moving to the next phase.
13. Do not delete invoices/orders silently. Use cancellation, credit note, status changes, and logs.
14. Every admin-sensitive action must be permission-protected and activity-logged.
15. Build first for Jenix India, but keep design product-ready for future resale.

---

## 2. Tech Stack

### Frontend

- Next.js / React
- Tailwind CSS
- Mobile-first responsive UI
- PWA support
- SEO-friendly pages

### Backend

- Node.js 18/20
- Express or NestJS-style modular architecture
- MongoDB
- JWT + refresh token / secure HttpOnly cookies preferred
- PM2 deployment

### Search

- Hybrid search design
- Start with MongoDB + custom buyer-intent mapping if needed
- Keep adapters ready for Meilisearch / Typesense / semantic vector search
- Search must support Hindi, Hinglish, English, spelling mistakes, and customer problem phrases

### Deployment

- Ubuntu VPS
- Nginx
- SSL
- PM2
- MongoDB local initially
- Cloudflare CDN recommended or use some better zero cost techn0logy that fetch data faster  and to save image use WebP formate if product page taking time due to slow network use skeleton but first periority to load product as fast as possible , use cache , direct routing ,so speed with secuirty can be maintained. 

## 3. Monorepo Architecture

```text
jenix-commerce/
│
├── apps/
│   ├── admin-panel/          # Admin PWA
│   └── front/                # Customer-facing PWA
│
├── backend/                  # API + business logic
│   └── src/
│       ├── modules/
│       ├── common/
│       ├── config/
│       ├── database/
│       ├── integrations/
│       ├── jobs/
│       ├── middlewares/
│       └── server.js
│
├── packages/
│   ├── shared-types/
│   ├── shared-utils/
│   ├── validators/
│   └── ui/
│
├── scripts/
│   ├── install.sh
│   ├── setup-vps.sh
│   ├── setup-nginx.sh
│   ├── setup-ssl.sh
│   ├── backup.sh
│   ├── restore.sh
│   ├── seed-admin.js
│   ├── seed-demo-data.js
│   └── health-check.sh
│
├── docker/
│   ├── docker-compose.yml
│   ├── backend.Dockerfile
│   ├── front.Dockerfile
│   └── admin.Dockerfile
│
├── docs/
│   ├── PROJECT.md
│   ├── DEPLOYMENT.md
│   ├── ADMIN_SETUP_GUIDE.md
│   ├── PAYMENT_GATEWAY_GUIDE.md
│   ├── GOOGLE_MERCHANT_GUIDE.md
│   ├── SEO_GUIDE.md
│   └── TROUBLESHOOTING.md
│
├── .env.example
├── package.json
└── README.md
```

---

## 4. App Separation

### 4.1 Customer Front App

Path:

```text
apps/front
```

Customer modules:

- Home
- Product listing
- Product detail
- Buyer-intent search
- Blog / knowledge base
- Cart
- Checkout
- Google login
- Phone OTP login
- Manual UPI / bank transfer payment
- Order success
- User profile
- Order history
- Invoice download
- Track order
- Contact enquiry
- Website buyer lead form
- PWA install support

### 4.2 Admin Panel App

Path:

```text
apps/admin-panel
```

Admin modules:

- Dashboard
- Orders
- Catalogue
- Customers
- Payments
- Shipping
- Invoices & Reports
- Marketing
- Blogs
- Staff & Permissions
- Settings
- Setup Wizard

---

## 5. Backend Module Structure

Every module should follow this structure:

```text
backend/src/modules/<module-name>/
├── <module>.model.js
├── <module>.routes.js
├── <module>.controller.js
├── <module>.service.js
├── <module>.validator.js
├── <module>.permissions.js optional
└── <module>.test.js or regression-checklist.md
```

Backend modules:

```text
auth
users
staff
roles-permissions
settings
products
categories
hsn-tax
inventory
search
cart
checkout
orders
walkin-orders
payments
payment-gateways
manual-payments
invoices
tally-export
shipping
couriers
shipments
gst
blogs
seo
google-merchant
facebook-feed
analytics
abandoned-cart
notifications
email-templates
offers
website-leads
contact-enquiries
reports
setup-wizard
audit-logs
```

---

## 6. Admin Menu Structure

```text
Dashboard

Orders
- Orders
- Walk-in Orders
- Contact Enquiries
- Abandoned Carts
- Dealer / Stockist Order Requests
- Payment Pending Orders
- Manual Payment Verification
- Refund Requests

Catalogue
- Categories
- Products
- Product Relations
- HSN / Tax Master
- Inventory
- Bulk Pricing / MOQ
- Google Shopping Fields
- Import / Export

Customers
- Customers
- Dealers / Stockists
- Customer Groups
- Saved Addresses
- Customer Enquiries

Payments
- Payment Gateways
- Manual Bank Transfer / UPI Verification
- Payment Attempts
- Refunds
- Direct Payment Discount

Shipping
- Shipping Methods
- Courier Profiles
- Shipping Aggregators
- Shipments
- Tracking / POD
- Pincode / Zone Settings

Invoices & Reports
- GST Invoices
- Tally Export
- Sales Report
- Invoice Report
- GST Report
- Shipping Report
- City / Pincode Report
- Inventory Report

Marketing
- Offers
- Email Templates
- Customer Segments
- WhatsApp Chat
- Abandoned Cart Recovery
- Notify When Available
- Facebook Pixel
- Google Analytics
- Google Merchant Feed
- Facebook Product Feed
- Sitemap

Blogs / Knowledge Base
- Blogs
- Blog Categories
- Blog Product Links

Staff & Permissions
- Staff Users
- Permission Groups
- Activity Logs

Settings
- Store Profile
- Branding
- SEO Defaults
- Contact Information
- Invoice Settings
- Checkout Settings
- Cart Behaviour
- Notification Settings
- Security Settings
- Custom Code / Tags
- Backup / Restore
- Setup Wizard
```

---

## 7. Phase-wise Execution Plan

Codex must execute phase-wise. Do not jump randomly.

### Phase 0 — Project Bootstrap

Goal: Create clean monorepo and base tooling.

Tasks:

1. Create monorepo folders.
2. Add backend base server.
3. Add admin app shell.
4. Add front app shell.
5. Add shared packages.
6. Add `.env.example`.
7. Add linting / formatting.
8. Add health check route.
9. Add README.

Acceptance checks:

- Backend starts.
- Front starts.
- Admin starts.
- Health check returns OK.
- Environment variables documented.

---

### Phase 1 — Core Settings, Branding, Store Profile

Goal: Create settings foundation used by invoice, email, SEO, bank transfer, contact page.

Settings sections:

#### Store Profile

- storeName
- legalBusinessName
- GSTIN
- address
- state
- stateCode
- supportEmail
- supportMobile
- WhatsApp number
- bankName
- accountHolderName
- accountNumber
- IFSC
- UPI ID
- businessHours
- pickupAddress

#### Branding

- favicon upload
- brand logo upload
- admin logo upload
- invoice logo upload
- email logo upload
- PWA app icon
- splash screen logo
- theme color
- button color

#### SEO Defaults

- homeMetaTitle
- homeMetaDescription
- defaultOgImage
- canonicalDomain
- robotsTxt
- sitemapEnabled
- searchConsoleVerification
- Bing verification optional

#### Contact Information

- publicPhone
- publicEmail
- publicWhatsApp
- publicAddress
- googleMapLink
- supportTiming
- socialLinks

#### Custom Code / Tags

- customHeadHtml
- customBodyStartHtml
- customBodyEndHtml
- customCss
- customJs
- Google Tag Manager
- Google Analytics
- Facebook Pixel

Only Super Admin can edit custom code.

Regression tests:

1. Store profile updates appear in API.
2. Logos upload and return usable URLs.
3. Invoice logo and email logo are stored separately.
4. SEO defaults render on home page.
5. Custom code is permission-protected.
6. Only Super Admin can edit custom code.

---

### Phase 2 — Auth, Staff, Permission Groups

Goal: Create secure admin and customer authentication.

Customer auth:

- Guest browsing
- Guest cart
- Google login
- Mobile OTP login
- Email/password optional
- User profile
- Account linking by verified email/mobile

Admin/staff auth:

- Super Admin
- Staff users
- Permission groups first, then link group to staff user
- Activity logs

Permission examples:

```text
products.view/create/edit/delete
orders.view/create/edit/cancel/export
payments.view/verify_manual/refund
invoices.view/generate/download/export_tally
shipping.view/create/update_tracking/mark_delivered/upload_pod
customers.view/edit/mark_dealer
reports.view/export
marketing.view/edit_offers/edit_templates
settings.view/edit/custom_code
staff.view/create/edit_permissions
```

Regression tests:

1. Guest can browse without login.
2. Guest can search without login.
3. Guest can add to cart without login.
4. Login at checkout merges guest cart.
5. Google login creates/verifies user.
6. Phone OTP login creates/verifies user.
7. Staff cannot access module without permission.
8. Activity log records admin action.

---

### Phase 3 — Catalogue, Categories, Products, HSN, Inventory

Goal: Build product catalogue for 500+ products.

Catalogue menu:

- Categories
- Products
- Product Relations
- HSN / Tax Master
- Inventory
- Bulk Pricing / MOQ
- Google Shopping Fields
- Import / Export

Product fields:

- title
- slug
- SKU auto-generated
- category
- subcategory
- brand
- modelNumber / MPN
- GTIN optional
- HSN code
- GST rate from HSN master
- basePrice
- salePrice
- product images
- shortDescription
- fullDescription
- specifications
- search keywords
- customer keywords
- use cases
- problem statements
- MOQ
- bulk pricing slabs
- quoteRequiredAboveQty
- product weight
- dimensions
- shipping class
- Google Shopping title
- Google Shopping description
- googleProductCategory
- productType
- active/inactive

HSN / Tax Master:

- HSN code
- description
- GST rate
- CGST rate
- SGST rate
- IGST rate
- effectiveFrom
- isActive

Inventory:

- stockQty
- reservedQty
- availableQty calculated
- stockStatus
- stockVisibility = hide_quantity
- allowBackorder
- maxOrderQty
- lowStockThreshold
- inventory movement log

Customer must not see exact stock quantity.

Regression tests:

1. Product can be created.
2. SKU auto-generates.
3. HSN GST applies to product.
4. Product image upload works.
5. Customer API does not expose exact stockQty.
6. Admin can see actual stock.
7. Low inventory alert triggers.
8. Inactive product is hidden from front.

---

### Phase 4 — Product Migration from Existing Site

Goal: Migrate public product data from `jenixindia.com` because website builder does not provide CSV export.

Build migration crawler.

Tech:

- Node.js
- Playwright or Puppeteer
- Cheerio
- Sharp
- CSV/JSON export

Crawler must collect public data only:

- product title
- oldUrl
- slug
- category
- price
- MRP
- discount
- product images
- short description
- full description
- specifications if visible
- SEO title/description if available

Do not collect:

- purchase price
- supplier name
- old customer data
- old order data
- internal management data

Output:

```text
products_raw.json
products_clean.csv
products_import.json
migration_report.json
failed_urls.json
/images/<product-slug>/*.webp
```

Image processing:

- thumbnail 300px
- medium 800px
- large 1200px
- WebP conversion

Workflow:

1. Crawl 10 products.
2. Review output quality.
3. Fix selectors.
4. Crawl all products.
5. Open CSV in Excel.
6. Manually fill HSN / GST correction / category correction.
7. Import to MongoDB.
8. Keep oldUrl for 301 redirects.

Regression tests:

1. Crawler does not visit login/cart/checkout/account pages.
2. 10-product sample output is valid.
3. Images are downloaded and converted.
4. Failed URLs are logged.
5. Import file matches product schema.

---

### Phase 5 — Buyer-Intent Search

Goal: Search must work like problem-to-product mapping, not only technical product name search.

Problem examples:

```text
gate kholne wali machine
mobile se door open karna
shop ke liye camera
school attendance camera
wifi wala tala
sim wala router
parking entry machine
bijli jane par camera chale
```

Search layers:

1. Exact SKU/model/title match
2. Synonym layer
3. Buyer phrase mapping
4. Use-case mapping
5. Semantic/vector search future-ready
6. Click/cart/purchase ranking
7. Personal user history

Search collections:

- search_synonyms
- buyer_phrase_mappings
- search_logs
- user_search_history
- user_view_history
- search_redirects

Admin must manage:

- synonyms
- buyer phrase mapping
- zero-result searches
- hidden product search keywords
- use-case mapping
- reindex button

Frontend search:

- autocomplete
- recent searches
- recently viewed
- suggested categories
- direct product results
- helpful blogs

Regression tests:

1. Exact SKU search returns correct product first.
2. `gate kholne wali machine` returns sliding gate motor.
3. `mobile se tala kholna` returns smart lock / QR unlock.
4. `dukan ke liye camera` returns CCTV products.
5. `sim wala internet` returns 4G router.
6. Zero-result search is saved for admin.
7. Logged-in user sees recent searches next time.
8. Recently viewed products appear.

---

### Phase 6 — Product Page UX and Recommendations

Goal: Product page should sell, educate, and cross-sell.

Product page order:

1. Breadcrumb
2. Product image gallery
3. Title
4. Price / sale price
5. MOQ / bulk price table
6. Availability status only, not stock quantity
7. GST invoice note
8. Quantity selector
9. Add to cart / Buy now / WhatsApp enquiry
10. Shipping estimator
11. Key features
12. Description
13. Specifications
14. Downloads / datasheet optional
15. Recently searched / viewed horizontal scroll
16. Backend-linked related products horizontal scroll
17. Frequently bought / accessories horizontal scroll
18. Top searched / most visited horizontal scroll
19. Helpful guides / blogs

Product relations:

- related
- accessory
- required_with
- spare_part
- similar
- upgrade
- frequently_bought_together

Regression tests:

1. Main product loads even if recommendation API fails.
2. Logged-in user sees recent products.
3. Admin-linked related products appear in correct order.
4. Inactive related products are hidden.
5. Carousels are horizontally scrollable on mobile.
6. Product page does not expose exact stock.

---

### Phase 7 — Cart, Checkout, MOQ, Bulk Pricing, Stock Reservation

Goal: Accurate cart calculation and stock safety.

Cart must support:

- guest cart
- logged-in cart
- guest-to-user merge
- MOQ
- bulk pricing slabs
- quote-required slabs
- stock check without revealing stock
- stock reservation
- GST calculation
- shipping calculation
- direct bank transfer discount
- round-off

MOQ / bulk pricing rules:

1. If qty below MOQ, do not allow add to cart.
2. If qty matches bulk slab, apply slab price.
3. If quoteRequired=true, do not allow direct checkout; create quote request.
4. GST applies on final unit price after discount.
5. Invoice shows final unit price.

Stock checks:

1. Add to cart
2. Cart update
3. Checkout start
4. Payment order creation
5. Payment success webhook

Stock reservation:

- default 15 minutes online payment
- release on payment failure / timeout
- deduct on payment success

Regression tests:

1. Guest cart works.
2. Login merges guest cart.
3. MOQ below limit fails.
4. Bulk slab price applies.
5. Quote-required slab creates quote flow.
6. Stock is reserved at checkout.
7. Payment failure releases stock.
8. Simultaneous checkout cannot oversell.

---

### Phase 8 — Shipping Calculation and Courier Tracking

Goal: Transparent cart-level shipping and manual tracking with future aggregator API readiness.

Shipping calculation:

- Product has weight and optional dimensions.
- Cart total weight = sum(product weight * qty).
- Shipping based on cart weight, pincode/state/zone, speed.
- No fake free shipping.
- Shipping not hidden in product price.

Shipping methods:

- Standard
- Express
- Local pickup
- Self pickup
- Transport / parcel
- Manual delivery

Shipping zones:

- Local
- State
- North India
- West India
- South India
- North East / Remote
- All India

Courier profiles:

- courierName
- courierCode
- trackingUrlTemplate
- trackingPageUrl
- supportPhone
- supportEmail
- apiEnabled
- apiProvider
- isActive

Shipment statuses:

- pending_packing
- packed
- ready_to_dispatch
- shipped
- in_transit
- out_for_delivery
- delivered
- delivery_failed
- returned
- cancelled
- ready_for_pickup
- picked_up

Manual tracking flow:

1. Paid order appears in shipping queue.
2. Admin packs material.
3. Admin selects courier.
4. Admin enters tracking ID / AWB.
5. System generates tracking URL.
6. Send tracking email.
7. Admin uploads POD when received.
8. Mark delivered.

Future adapter:

```text
ShippingProvider
- ManualCourierProvider
- ShiprocketProvider future
- DelhiveryProvider future
- DTDCProvider future
- BlueDartProvider future
```

Regression tests:

1. Cart shipping calculated once at cart level.
2. Standard and express return different rates.
3. Remote pincode extra charge works if configured.
4. Tracking URL generated from template.
5. Tracking email sends.
6. POD upload works.
7. Delivered status updates order.

---

### Phase 9 — Multi Payment Gateway and Manual Bank Transfer

Goal: Avoid vendor lock-in to Razorpay.

Architecture:

```text
PaymentGateway interface
- RazorpayGateway
- CashfreeGateway future
- PhonePeGateway future
- PayUGateway future
- CCAvenueGateway future
- ManualUPIGateway
- BankTransferGateway
```

Payment gateway interface:

- createPaymentOrder()
- verifyPayment()
- handleWebhook()
- refundPayment()
- getPaymentStatus()

Admin can:

- enable/disable gateway
- set priority
- set test/live mode
- set min/max order value
- configure credentials

Manual bank transfer / UPI flow:

1. Customer selects manual bank transfer / UPI.
2. Discount may apply.
3. Order created as payment_pending.
4. Customer sees bank/UPI details.
5. Customer enters UTR and uploads screenshot.
6. Admin verifies.
7. Mark paid.
8. Generate invoice.

Direct payment discount:

- Only discount type initially needed.
- Default 2%.
- Applies only to manual bank transfer / manual UPI.
- Does not apply to online PG.
- Admin configurable.
- Invoice shows discount line.

Regression tests:

1. Razorpay can be enabled/disabled.
2. Disabled gateway is not used.
3. Same order can have multiple payment attempts.
4. Duplicate webhook does not create duplicate invoice.
5. Manual payment stays pending until admin verifies.
6. Direct payment discount applies only for manual payment.
7. Switching payment method adds/removes discount.

---

### Phase 10 — GST Invoice, Tally Export, Invoice Settings

Goal: GST-compliant invoice and accounting export.

Invoice settings:

- invoicePrefix
- invoicePostfix
- financialYearFormat
- invoiceStartingNumber
- invoiceNumberPadding
- invoice logo
- invoice footer
- invoice terms
- authorized signatory image
- show bank details
- show HSN summary
- show shipping line
- show discount line
- custom invoice fields

Invoice number example:

```text
JNX/2026-27/000001
```

Invoice must include:

- seller details
- buyer details
- GSTIN if B2B
- invoice number/date
- order number
- place of supply
- HSN
- product name
- SKU
- qty
- final unit price
- taxable value
- GST rate
- CGST/SGST/IGST
- shipping line
- discount line
- round-off
- grand total
- amount in words
- payment status
- terms
- authorized signatory

GST logic:

```text
if sellerStateCode == buyerStateCode:
  use CGST + SGST
else:
  use IGST
```

Tally export:

- CSV
- XML future-ready
- selected date range
- monthly / yearly

Regression tests:

1. Invoice number sequential and unique.
2. Same-state uses CGST/SGST.
3. Different-state uses IGST.
4. Invoice locks after generation.
5. Duplicate payment webhook does not create duplicate invoice.
6. Tally CSV totals match invoice totals.
7. Custom fields appear on invoice.
8. Round-off works.

---

### Phase 11 — Customer Profile and Order History

Goal: Customer self-service area.

Profile sections:

- My Profile
- My Orders
- My Invoices
- My Tracking
- My Addresses
- GST Details
- Recently Viewed
- Recent Searches
- Saved Products
- Support

My Orders shows:

- orderNo
- orderDate
- orderTotal
- paymentStatus
- invoiceStatus
- shipmentStatus
- courierName
- trackingId
- actions: View, Download Invoice, Track, Reorder

Order detail shows:

- product list
- SKU
- qty
- unit price used
- bulk price message
- GST
- shipping
- grand total
- payment method
- payment status
- invoice download
- tracking details
- shipment timeline

Reorder:

- Do not reuse old price blindly.
- Fetch current price.
- Recalculate MOQ/bulk price.
- Recalculate GST/shipping.
- Check backend stock.

Regression tests:

1. Customer can see own orders.
2. Customer cannot see another user’s order.
3. Customer can download own invoice.
4. Guest order links only after verified mobile/email.
5. Reorder recalculates current prices.
6. Tracking appears after admin enters shipment.

---

### Phase 12 — Abandoned Cart and Customer Recovery

Goal: Recover carts and understand payment friction.

Track:

- userId or sessionId
- customerName
- mobile/email
- cartItems
- cartValue
- stage
- paymentAttemptId
- razorpayOrderId / gateway order ID
- failureReason
- lastActivityAt
- reminderCount
- recoveryToken
- feedback reason

Stages:

- active
- cart_added
- checkout_started
- payment_pending
- payment_failed
- abandoned
- recovered
- expired

Reminder timing:

- 30 minutes
- 6 hours
- 24 hours
- stop after 3 reminders

Feedback options:

- payment problem
- need GST invoice
- need installation support
- confused about product
- need bulk price
- want WhatsApp/call support
- only checking price

Regression tests:

1. Cart is saved after add-to-cart.
2. Payment failed changes stage.
3. Recovery link restores cart.
4. Reminder not sent after order completion.
5. Reminder count does not exceed limit.
6. Feedback reason saved.

---

### Phase 13 — Blog / Knowledge Base

Goal: Education-to-product funnel and SEO.

Blog fields:

- title
- slug
- excerpt
- content
- featuredImage
- category
- tags
- author
- status
- publishedAt
- updatedAt
- seoTitle
- seoDescription
- canonicalUrl
- ogImage
- linkedProductIds
- linkedCategoryIds
- relatedBlogIds
- FAQ items

Blog categories:

- CCTV & Surveillance Guide
- Smart Door Lock Guide
- Gate Automation Guide
- Access Control Guide
- Networking / 4G Router Guide
- Smart Home Guide
- Parking System Guide
- QR Unlock / Video Doorbell Guide
- Installation Guide
- Buying Guide
- Troubleshooting Guide

Blog page must show:

- article content
- related products
- related categories
- FAQ
- WhatsApp / request quote CTA
- related blogs

Product page must show helpful guides.

Search must search blogs also.

Regression tests:

1. Published blog visible publicly.
2. Draft blog hidden.
3. Blog shows linked products.
4. Product page shows helpful guides.
5. Blog appears in sitemap.
6. Article JSON-LD valid.
7. FAQ schema appears if FAQ exists.

---

### Phase 14 — Google Shopping, SEO, Feeds, Sitemap

Goal: Products appear in Google Shopping / merchant surfaces.

Rules:

- Product price must be clean.
- Shipping must not be hidden in product price.
- Feed must include shipping_weight.

Product page structured data:

- Product JSON-LD
- Offer JSON-LD
- Breadcrumb JSON-LD
- Shipping/return policy where applicable

Google Merchant feed fields:

- id
- title
- description
- link
- image_link
- additional_image_link
- availability
- price
- sale_price if applicable
- brand
- mpn
- gtin optional
- condition
- google_product_category
- product_type
- shipping_weight
- identifier_exists where needed

Feeds:

- `/google-merchant-feed.xml`
- Facebook product feed future
- sitemap.xml
- product sitemap
- category sitemap
- blog sitemap

Regression tests:

1. Product page has Product JSON-LD.
2. Merchant feed contains active products.
3. Feed price matches website price.
4. Shipping is separate from product price.
5. Product has shipping_weight.
6. Sitemap includes product/category/blog URLs.
7. Out-of-stock availability correct.

---

### Phase 15 — Website Buyer Lead Form

Goal: Use Jenix site as demo to sell same webapp to others.

At bottom of front site:

```text
Do you want same type webapp for your business?
```

Fields:

- name
- mobile
- email
- businessName
- businessType
- city
- currentWebsite optional
- monthlyOrders optional
- productCount optional
- message
- sourcePage

Admin shows under Website Buyer Leads.

Lead statuses:

- new
- contacted
- demo_scheduled
- proposal_sent
- converted
- not_interested
- closed

Regression tests:

1. Lead form submits.
2. Lead appears in admin.
3. Source page stored.
4. Admin can update status and notes.

---

### Phase 16 — Reports

Goal: Admin can download useful business data.

Reports:

- Sales Report
- Invoice Report
- GST Report
- Payment Report
- Shipping Report
- Dealer / Stockist Sales Report
- Product Sales Report
- City / Pincode Order Report
- Abandoned Cart Report
- Marketing Offer Report
- Inventory Report

Filters:

- monthly
- yearly
- custom date range
- city
- pincode
- state
- courier
- customer type
- payment status
- order status
- shipment status

Export:

- CSV
- Excel
- PDF summary optional
- invoice PDFs as ZIP
- Tally CSV/XML

Sales columns:

- orderNo
- invoiceNo
- invoiceDate
- customerName
- customerType
- city
- pincode
- state
- GSTIN
- productTotal
- discount
- GST
- shipping
- grandTotal
- paymentMethod
- paymentStatus
- orderStatus
- shipmentStatus

Regression tests:

1. Monthly sales report downloads.
2. Yearly invoice report downloads.
3. City/pincode filter works.
4. Totals match order/invoice data.
5. Staff without export permission cannot export.

---

### Phase 17 — Marketing, Offers, Templates, Notifications

Goal: Communication and promotion control.

Marketing menu:

- Offers
- Email Templates
- Customer Segments
- WhatsApp Chat
- Abandoned Cart Recovery
- Notify When Available
- Facebook Pixel
- Google Analytics
- Google Merchant Feed
- Facebook Product Feed
- Sitemap

Offers:

- time_bound
- amount_based
- product_based
- category_based
- customer_type_based
- dealer_stockist_offer
- direct_payment_discount

Email templates:

- login_success
- customer_verification_email
- forgot_password
- otp_login_code
- order_placed
- awaiting_payment
- payment_failed
- payment_successful
- manual_payment_submitted
- manual_payment_verified
- order_left_in_cart
- cart_reminder
- fulfilment_started
- order_dispatched
- tracking_detail_update
- order_delivered
- shipment_feedback
- refund_successful
- notify_when_available
- bulk_quote_received
- dealer_order_request_received
- dealer_order_approved
- ready_for_pickup
- self_pickup_completed

Template variables:

- customerName
- orderNo
- invoiceNo
- paymentLink
- trackingId
- trackingUrl
- courierName
- cartItems
- invoiceDownloadUrl
- supportPhone
- businessName
- refundAmount
- productName
- pickupLocation
- pickupInstructions

Notification service:

- Business modules emit events.
- Notification service loads template.
- Variables are filled.
- Email sent.
- Result logged.
- Future channels: SMS, WhatsApp, PWA push.

Regression tests:

1. Template can be edited.
2. Template preview works.
3. Order placed sends order_placed template.
4. Payment failed sends payment_failed template.
5. Tracking update sends tracking template.
6. Notification logs saved.

---

### Phase 18 — B2B Dealer / Stockist Workflow

Goal: Approved customers get dealer/stockist pricing and offline order flow.

Customer types:

- retail
- dealer
- stockist
- distributor
- institutional
- project

Customer fields:

- customerType
- priceGroup
- isB2BApproved
- GSTIN
- companyName
- creditAllowed
- bankTransferOnly
- pickupAllowed
- orderMode

Pricing priority:

1. customer-specific price
2. price group price
3. bulk MOQ slab
4. sale price
5. base price

Dealer checkout:

- Shows dealer price after login.
- Button: Place Order Request.
- No online PG required.
- Admin approves.
- Payment by bank transfer/manual verification.
- Dispatch/self-pickup manually processed.

Statuses:

- order_request_received
- awaiting_admin_approval
- awaiting_bank_payment
- payment_received
- packing_started
- ready_for_pickup
- dispatched
- delivered
- picked_up
- completed
- cancelled

Regression tests:

1. Admin marks customer as dealer.
2. Dealer sees dealer price.
3. Retail customer does not see dealer price.
4. Dealer checkout creates offline order request.
5. Manual payment verification generates invoice.
6. Self pickup flow works.

Note: Dealer mobile app is future phase after web platform stabilizes.

---

### Phase 19 — Walk-in Orders / Manual Orders

Goal: Admin can create offline/walk-in order.

Flow:

1. Add/select customer.
2. Add customer details.
3. Select products by name/SKU/category.
4. Add quantity.
5. Apply retail/dealer/stockist/custom price.
6. Apply GST from HSN.
7. Add shipping/self-pickup.
8. Select payment mode.
9. Create order.
10. Generate invoice after payment confirmation/admin approval.
11. Fulfil manually.

Payment modes:

- cash
- bank transfer
- manual UPI
- cheque
- online payment link
- credit / pay later if allowed

Statuses:

- walkin_order_created
- payment_pending
- paid
- invoice_generated
- ready_for_pickup
- dispatched
- completed
- cancelled

Regression tests:

1. Walk-in customer can be created.
2. Existing customer can be selected.
3. Product selection works.
4. GST applies.
5. Payment mode stored.
6. Invoice generated after payment confirmation.

---

### Phase 20 — Installer, Setup Wizard, Productization

Goal: Same project can be sold to other businesses.

Scripts:

- install.sh
- setup-vps.sh
- setup-nginx.sh
- setup-ssl.sh
- backup.sh
- restore.sh
- seed-admin.js
- health-check.sh

Installer should support:

- Ubuntu VPS
- Node.js
- MongoDB
- Nginx
- PM2
- SSL
- domain setup
- admin user creation
- environment generation
- daily backup cron

Suggested domains:

```text
https://businessdomain.com
https://admin.businessdomain.com
https://api.businessdomain.com
```

Setup wizard steps:

1. Business profile
2. Logo/favicon/theme
3. GST profile
4. Invoice settings
5. Admin user
6. SMTP/email
7. Google login
8. Phone OTP provider
9. Payment gateway
10. Manual bank/UPI
11. Shipping/courier profile
12. Google Merchant Center
13. SEO/Search Console
14. Facebook/Meta pixel optional
15. Backup settings
16. Launch checklist

Regression tests:

1. Installer creates environment.
2. Backend starts after install.
3. Front/admin served through Nginx.
4. SSL works.
5. First admin setup wizard opens.
6. Backup script runs.
7. Health check passes.

---

## 8. Data Models — Minimum Draft

### Product

```json
{
  "title": "",
  "slug": "",
  "sku": "",
  "oldUrl": "",
  "categoryId": "",
  "brand": "",
  "modelNumber": "",
  "mpn": "",
  "gtin": "",
  "hsnCode": "",
  "gstRate": 0,
  "basePrice": 0,
  "salePrice": 0,
  "moq": 1,
  "bulkPricingEnabled": false,
  "bulkPriceSlabs": [],
  "quoteRequiredAboveQty": null,
  "stockQty": 0,
  "reservedQty": 0,
  "stockVisibility": "hide_quantity",
  "allowBackorder": false,
  "lowStockThreshold": 0,
  "deadWeightKg": 0,
  "lengthCm": null,
  "widthCm": null,
  "heightCm": null,
  "shippingClass": "normal",
  "shortDescription": "",
  "fullDescription": "",
  "specifications": {},
  "images": [],
  "technicalKeywords": [],
  "customerKeywords": [],
  "useCases": [],
  "problemStatements": [],
  "googleShoppingTitle": "",
  "googleShoppingDescription": "",
  "googleProductCategory": "",
  "productType": "",
  "isActive": true
}
```

### Order

```json
{
  "orderNo": "",
  "userId": "",
  "customerType": "retail",
  "items": [],
  "productSubtotal": 0,
  "discountAmount": 0,
  "taxableValue": 0,
  "gstTotal": 0,
  "shippingCharge": 0,
  "roundOff": 0,
  "grandTotal": 0,
  "paymentStatus": "pending",
  "orderStatus": "placed",
  "shipmentStatus": "pending_packing",
  "invoiceId": null,
  "paymentMethod": "",
  "shippingMethod": "",
  "billingAddress": {},
  "shippingAddress": {},
  "createdAt": ""
}
```

### Invoice

```json
{
  "invoiceNo": "",
  "orderId": "",
  "invoiceDate": "",
  "seller": {},
  "buyer": {},
  "items": [],
  "taxSummary": [],
  "shippingLine": {},
  "discountLine": {},
  "roundOff": 0,
  "grandTotal": 0,
  "pdfUrl": "",
  "isLocked": true,
  "createdAt": ""
}
```

### Shipment

```json
{
  "orderId": "",
  "invoiceNo": "",
  "shipmentStatus": "pending_packing",
  "courierCode": "",
  "courierName": "",
  "trackingId": "",
  "trackingUrl": "",
  "dispatchDate": "",
  "expectedDeliveryDate": "",
  "packageWeightKg": 0,
  "packageCount": 1,
  "podStatus": "pending",
  "podFileUrl": "",
  "deliveredAt": "",
  "adminNotes": ""
}
```

---

## 9. API Naming Guidelines

Use REST-style APIs.

Examples:

```text
GET /api/products
GET /api/products/:slug
POST /api/admin/products
PATCH /api/admin/products/:id

GET /api/search?q=
GET /api/search/suggest?q=
POST /api/search/click

POST /api/cart/items
PATCH /api/cart/items/:id
GET /api/cart

POST /api/checkout/start
POST /api/payments/create-attempt
POST /api/payments/webhook/:gateway

GET /api/user/orders
GET /api/user/orders/:orderId
GET /api/user/orders/:orderId/invoice

GET /api/admin/reports/sales
GET /api/admin/reports/invoices
```

---

## 10. UI Component Guidelines

Both apps must be component-based.

Shared components:

- Button
- Input
- Select
- Modal
- Drawer
- Table
- MobileCardList
- ProductCard
- ProductCarousel
- StatusBadge
- PriceDisplay
- InvoicePreview
- FileUpload
- RichTextEditor
- PermissionGuard
- EmptyState
- SkeletonLoader

Mobile-first behavior:

- Use cards on mobile instead of large tables.
- Admin navigation should use bottom tabs or collapsible drawer on mobile.
- Front product cards should be optimized for thumb scrolling.
- Recommendation sections should use horizontal scroll.

---

## 11. Anti-Hallucination Implementation Method

For each phase, Codex must:

1. Read this PROJECT.md.
2. Implement only current phase tasks.
3. Add or update tests/checklist.
4. Update progress section at bottom.
5. Mark completed files and pending files.
6. Do not invent provider-specific credentials.
7. Do not hard-code live secrets.
8. Add `.env.example` keys only.
9. Use TODO comments for future adapters.
10. Keep public APIs from exposing private stock/cost/staff data.

---

## 12. Progress Tracker

Codex must update this section after each phase.

```text
[ ] Phase 0 — Project Bootstrap
[ ] Phase 1 — Core Settings, Branding, Store Profile
[ ] Phase 2 — Auth, Staff, Permission Groups
[ ] Phase 3 — Catalogue, Categories, Products, HSN, Inventory
[ ] Phase 4 — Product Migration from Existing Site
[ ] Phase 5 — Buyer-Intent Search
[ ] Phase 6 — Product Page UX and Recommendations
[ ] Phase 7 — Cart, Checkout, MOQ, Bulk Pricing, Stock Reservation
[ ] Phase 8 — Shipping Calculation and Courier Tracking
[ ] Phase 9 — Multi Payment Gateway and Manual Bank Transfer
[ ] Phase 10 — GST Invoice, Tally Export, Invoice Settings
[ ] Phase 11 — Customer Profile and Order History
[ ] Phase 12 — Abandoned Cart and Customer Recovery
[ ] Phase 13 — Blog / Knowledge Base
[ ] Phase 14 — Google Shopping, SEO, Feeds, Sitemap
[ ] Phase 15 — Website Buyer Lead Form
[ ] Phase 16 — Reports
[ ] Phase 17 — Marketing, Offers, Templates, Notifications
[ ] Phase 18 — B2B Dealer / Stockist Workflow
[ ] Phase 19 — Walk-in Orders / Manual Orders
[ ] Phase 20 — Installer, Setup Wizard, Productization
```

---

### Backend-First Execution Log (VPS) � Updated May 22, 2026

Phase 0 (Backend scope) status: `[x]`

Completed files:
- `VPS/package.json`
- `VPS/pnpm-workspace.yaml`
- `VPS/.env.example`
- `VPS/README.md`
- `VPS/backend/src/app.js`
- `VPS/backend/src/server.js`
- `VPS/backend/src/config/env.js`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/common/http-error.js`
- `VPS/backend/src/common/http-response.js`
- `VPS/backend/src/middlewares/request-context.js`
- `VPS/backend/src/middlewares/require-admin-auth.js`
- `VPS/backend/src/middlewares/error-handler.js`
- `VPS/backend/src/checks/run-regression-checks.js`
- `VPS/eslint.config.cjs`
- `VPS/.prettierrc.json`
- `VPS/ecosystem.config.cjs`
- `VPS/docs/DEPLOYMENT.md`
- `VPS/scripts/health-check.sh`

Pending files/tasks before full Phase 0 closure:
- Runnable `Next.js/React` shell for `VPS/apps/front`
- Runnable `Next.js/React` shell for `VPS/apps/admin-panel`
- Startup/build checks for those two app shells

Phase 1 (Backend scope: Admin first, then Front) status: `[x]`

Completed files:
- `VPS/backend/src/modules/settings/settings.model.js`
- `VPS/backend/src/modules/settings/settings.validator.js`
- `VPS/backend/src/modules/settings/settings.permissions.js`
- `VPS/backend/src/modules/settings/settings.service.js`
- `VPS/backend/src/modules/settings/settings.controller.js`
- `VPS/backend/src/modules/settings/settings.routes.js`
- `VPS/backend/src/modules/settings/regression-checklist.md`
- `VPS/backend/src/database/json-file-store.js`
- `VPS/backend/src/integrations/README.md`
- `VPS/backend/src/integrations/payment-gateways/payment-gateway.adapter.js`
- `VPS/backend/src/integrations/shipping-providers/shipping-provider.adapter.js`
- `VPS/backend/src/integrations/otp-providers/otp-provider.adapter.js`
- `VPS/backend/src/integrations/email-providers/email-provider.adapter.js`
- `VPS/backend/src/integrations/analytics-providers/analytics-provider.adapter.js`

Pending files/tasks before full Phase 1 closure:
- Admin settings UI screen in `apps/admin-panel` wired to new backend endpoints
- Front home/footer/contact integration in `apps/front` using public settings APIs
- Branding asset upload UI flow on admin side
- Front consumption of SEO defaults on homepage metadata

---
## 13. First Codex Execution Prompt

Use this prompt to start implementation:

```text
You are working on Jenix Commerce. Read PROJECT.md fully before coding.

Start with Phase 0 only.

Create the monorepo structure:
- apps/front
- apps/admin-panel
- backend
- packages/shared-types
- packages/shared-utils
- packages/validators
- packages/ui
- scripts
- docs
- docker

Create base backend Node.js server with health check.
Create base Next.js/React front app shell.
Create base Next.js/React admin panel shell.
Both apps must be mobile-first and PWA-ready placeholders.
Add .env.example.
Add README with local setup instructions.
Add progress update in PROJECT.md after Phase 0.

Do not implement product/order/payment yet.
Do not hard-code any provider.
Do not invent secrets.
After implementation, run basic start/build checks and report results.
```

---

## 14. Second Codex Execution Prompt

```text
Continue Jenix Commerce from PROJECT.md.

Implement Phase 1 — Core Settings, Branding, Store Profile.

Backend:
- settings module
- store profile settings
- branding/logo upload placeholders
- SEO defaults
- contact information
- custom code/tags storage
- permission guard placeholder for custom code

Admin:
- Settings page with sections:
  Store Profile, Branding, SEO Defaults, Contact Information, Custom Code/Tags

Front:
- Use store profile/contact info on footer/contact section
- Use SEO defaults on home page

Add validation and regression checklist.
Update PROJECT.md progress.
```

---

## 15. Notes for Future Dealer Mobile App

Dealer mobile app is **not Phase 1**. Build web platform first.

Future dealer app can reuse:

- auth
- dealer pricing
- order request APIs
- profile/order history
- invoice download
- manual payment flow
- self pickup/dispatch status

Do not block web development waiting for mobile app.


