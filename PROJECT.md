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
â”‚
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ admin-panel/          # Admin PWA
â”‚   â””â”€â”€ front/                # Customer-facing PWA
â”‚
â”œâ”€â”€ backend/                  # API + business logic
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ modules/
â”‚       â”œâ”€â”€ common/
â”‚       â”œâ”€â”€ config/
â”‚       â”œâ”€â”€ database/
â”‚       â”œâ”€â”€ integrations/
â”‚       â”œâ”€â”€ jobs/
â”‚       â”œâ”€â”€ middlewares/
â”‚       â””â”€â”€ server.js
â”‚
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ shared-types/
â”‚   â”œâ”€â”€ shared-utils/
â”‚   â”œâ”€â”€ validators/
â”‚   â””â”€â”€ ui/
â”‚
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ install.sh
â”‚   â”œâ”€â”€ setup-vps.sh
â”‚   â”œâ”€â”€ setup-nginx.sh
â”‚   â”œâ”€â”€ setup-ssl.sh
â”‚   â”œâ”€â”€ backup.sh
â”‚   â”œâ”€â”€ restore.sh
â”‚   â”œâ”€â”€ seed-admin.js
â”‚   â”œâ”€â”€ seed-demo-data.js
â”‚   â””â”€â”€ health-check.sh
â”‚
â”œâ”€â”€ docker/
â”‚   â”œâ”€â”€ docker-compose.yml
â”‚   â”œâ”€â”€ backend.Dockerfile
â”‚   â”œâ”€â”€ front.Dockerfile
â”‚   â””â”€â”€ admin.Dockerfile
â”‚
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ PROJECT.md
â”‚   â”œâ”€â”€ DEPLOYMENT.md
â”‚   â”œâ”€â”€ ADMIN_SETUP_GUIDE.md
â”‚   â”œâ”€â”€ PAYMENT_GATEWAY_GUIDE.md
â”‚   â”œâ”€â”€ GOOGLE_MERCHANT_GUIDE.md
â”‚   â”œâ”€â”€ SEO_GUIDE.md
â”‚   â””â”€â”€ TROUBLESHOOTING.md
â”‚
â”œâ”€â”€ .env.example
â”œâ”€â”€ package.json
â””â”€â”€ README.md
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
â”œâ”€â”€ <module>.model.js
â”œâ”€â”€ <module>.routes.js
â”œâ”€â”€ <module>.controller.js
â”œâ”€â”€ <module>.service.js
â”œâ”€â”€ <module>.validator.js
â”œâ”€â”€ <module>.permissions.js optional
â””â”€â”€ <module>.test.js or regression-checklist.md
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

### Phase 0 â€” Project Bootstrap

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

### Phase 1 â€” Core Settings, Branding, Store Profile

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

### Phase 2 â€” Auth, Staff, Permission Groups

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

### Phase 3 â€” Catalogue, Categories, Products, HSN, Inventory

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

### Phase 4 â€” Product Migration from Existing Site

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

### Phase 5 â€” Buyer-Intent Search

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

### Phase 6 â€” Product Page UX and Recommendations

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

### Phase 7 â€” Cart, Checkout, MOQ, Bulk Pricing, Stock Reservation

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

### Phase 8 â€” Shipping Calculation and Courier Tracking

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

### Phase 9 â€” Multi Payment Gateway and Manual Bank Transfer

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

### Phase 10 â€” GST Invoice, Tally Export, Invoice Settings

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

### Phase 11 â€” Customer Profile and Order History

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
2. Customer cannot see another userâ€™s order.
3. Customer can download own invoice.
4. Guest order links only after verified mobile/email.
5. Reorder recalculates current prices.
6. Tracking appears after admin enters shipment.

---

### Phase 12 â€” Abandoned Cart and Customer Recovery

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

### Phase 13 â€” Blog / Knowledge Base

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

### Phase 14 â€” Google Shopping, SEO, Feeds, Sitemap

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

### Phase 15 â€” Website Buyer Lead Form

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

### Phase 16 â€” Reports

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

### Phase 17 â€” Marketing, Offers, Templates, Notifications

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

### Phase 18 â€” B2B Dealer / Stockist Workflow

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

### Phase 19 â€” Walk-in Orders / Manual Orders

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

### Phase 20 â€” Installer, Setup Wizard, Productization

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

## 8. Data Models â€” Minimum Draft

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
  "items": [],after 
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
[x] Phase 0 â€” Project Bootstrap
[x] Phase 1 â€” Core Settings, Branding, Store Profile
[x] Phase 2 â€” Auth, Staff, Permission Groups
[x] Phase 3 â€” Catalogue, Categories, Products, HSN, Inventory
[~] Phase 4 â€” Product Migration from Existing Site (Deferred)
[x] Phase 5 â€” Buyer-Intent Search
[x] Phase 6 â€” Product Page UX and Recommendations
[x] Phase 7 â€” Cart, Checkout, MOQ, Bulk Pricing, Stock Reservation
[x] Phase 8 â€” Shipping Calculation and Courier Tracking
[x] Phase 9 â€” Multi Payment Gateway and Manual Bank Transfer
[x] Phase 10 â€” GST Invoice, Tally Export, Invoice Settings
[x] Phase 11 â€” Customer Profile and Order History
[x] Phase 12 â€” Abandoned Cart and Customer Recovery
[x] Phase 13 â€” Blog / Knowledge Base
[x] Phase 14 â€” Google Shopping, SEO, Feeds, Sitemap
[ ] Phase 15 â€” Website Buyer Lead Form
[ ] Phase 16 â€” Reports
[ ] Phase 17 â€” Marketing, Offers, Templates, Notifications
[ ] Phase 18 â€” B2B Dealer / Stockist Workflow
[ ] Phase 19 â€” Walk-in Orders / Manual Orders
[ ] Phase 20 â€” Installer, Setup Wizard, Productization
```

---

### Backend-First Execution Log (VPS) — Updated May 27, 2026

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
- Startup/build checks for front app shell (`VPS/apps/front`)

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

Phase 2 (Backend scope: Auth, Staff, Permission Groups) status: `[x]`

Completed files:
- `VPS/backend/src/modules/auth/auth.model.js`
- `VPS/backend/src/modules/auth/auth.validator.js`
- `VPS/backend/src/modules/auth/auth.permissions.js`
- `VPS/backend/src/modules/auth/auth.service.js`
- `VPS/backend/src/modules/auth/auth.controller.js`
- `VPS/backend/src/modules/auth/auth.routes.js`
- `VPS/backend/src/modules/auth/regression-checklist.md`
- `VPS/backend/src/modules/staff/staff.model.js`
- `VPS/backend/src/modules/staff/staff.validator.js`
- `VPS/backend/src/modules/staff/staff.permissions.js`
- `VPS/backend/src/modules/staff/staff.service.js`
- `VPS/backend/src/modules/staff/staff.controller.js`
- `VPS/backend/src/modules/staff/staff.routes.js`
- `VPS/backend/src/modules/staff/regression-checklist.md`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.model.js`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.validator.js`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.permissions.js`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.service.js`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.controller.js`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.routes.js`
- `VPS/backend/src/modules/roles-permissions/regression-checklist.md`
- `VPS/backend/src/modules/audit-logs/audit-logs.model.js`
- `VPS/backend/src/modules/audit-logs/audit-logs.validator.js`
- `VPS/backend/src/modules/audit-logs/audit-logs.permissions.js`
- `VPS/backend/src/modules/audit-logs/audit-logs.service.js`
- `VPS/backend/src/modules/audit-logs/audit-logs.controller.js`
- `VPS/backend/src/modules/audit-logs/audit-logs.routes.js`
- `VPS/backend/src/modules/audit-logs/regression-checklist.md`
- `VPS/backend/src/middlewares/require-admin-permission.js`
- `VPS/backend/src/middlewares/require-customer-auth.js`
- `VPS/backend/src/common/token-service.js`
- `VPS/backend/src/common/identity.js`
- `VPS/backend/src/database/auth-store.js`
- `VPS/backend/src/integrations/google-auth/google-auth.adapter.js`

Pending files/tasks before full Phase 2 closure:
- Complete remaining staff/permission-group management screens in `apps/admin-panel` (admin login is now wired)
- Integrate customer login/signup/OTP flows in `apps/front`
- Replace mock Google/OTP verification with provider adapters in future integration phase
- Add secure HttpOnly cookie strategy for refresh tokens in production deployment hardening

Phase 3 (Backend scope: Catalogue, Categories, Products, HSN, Inventory) status: `[x]`

Completed files:
- `VPS/backend/src/database/catalog-store.js`
- `VPS/backend/src/modules/catalogue/catalogue.model.js`
- `VPS/backend/src/modules/catalogue/catalogue.validator.js`
- `VPS/backend/src/modules/catalogue/catalogue.permissions.js`
- `VPS/backend/src/modules/catalogue/catalogue.service.js`
- `VPS/backend/src/modules/catalogue/catalogue.controller.js`
- `VPS/backend/src/modules/catalogue/catalogue.routes.js`
- `VPS/backend/src/modules/catalogue/regression-checklist.md`
- `VPS/backend/src/modules/categories/categories.model.js`
- `VPS/backend/src/modules/categories/categories.validator.js`
- `VPS/backend/src/modules/categories/categories.permissions.js`
- `VPS/backend/src/modules/categories/categories.service.js`
- `VPS/backend/src/modules/categories/categories.controller.js`
- `VPS/backend/src/modules/categories/categories.routes.js`
- `VPS/backend/src/modules/categories/regression-checklist.md`
- `VPS/backend/src/modules/hsn-tax/hsn-tax.model.js`
- `VPS/backend/src/modules/hsn-tax/hsn-tax.validator.js`
- `VPS/backend/src/modules/hsn-tax/hsn-tax.permissions.js`
- `VPS/backend/src/modules/hsn-tax/hsn-tax.service.js`
- `VPS/backend/src/modules/hsn-tax/hsn-tax.controller.js`
- `VPS/backend/src/modules/hsn-tax/hsn-tax.routes.js`
- `VPS/backend/src/modules/hsn-tax/regression-checklist.md`
- `VPS/backend/src/modules/products/products.model.js`
- `VPS/backend/src/modules/products/products.validator.js`
- `VPS/backend/src/modules/products/products.permissions.js`
- `VPS/backend/src/modules/products/products.service.js`
- `VPS/backend/src/modules/products/products.controller.js`
- `VPS/backend/src/modules/products/products.routes.js`
- `VPS/backend/src/modules/products/regression-checklist.md`
- `VPS/backend/src/modules/inventory/inventory.model.js`
- `VPS/backend/src/modules/inventory/inventory.validator.js`
- `VPS/backend/src/modules/inventory/inventory.permissions.js`
- `VPS/backend/src/modules/inventory/inventory.service.js`
- `VPS/backend/src/modules/inventory/inventory.controller.js`
- `VPS/backend/src/modules/inventory/inventory.routes.js`
- `VPS/backend/src/modules/inventory/regression-checklist.md`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/checks/run-regression-checks.js`

Pending files/tasks before full Phase 3 closure:
- Build front product listing/detail pages in `apps/front` using new public endpoints
- Add real image pipeline (WebP resize/sizes) in migration/import phase (Phase 4)
- Add import/export tooling with CSV validations (Phase 4)

Phase 3 (Admin UI scope: Catalogue, Categories, Products, HSN, Inventory) status: `[x]`

Completed files:
- `VPS/apps/admin-panel/package.json`
- `VPS/apps/admin-panel/.env.example`
- `VPS/apps/admin-panel/vite.config.js`
- `VPS/apps/admin-panel/index.html`
- `VPS/apps/admin-panel/public/manifest.webmanifest`
- `VPS/apps/admin-panel/public/icon-192.svg`
- `VPS/apps/admin-panel/public/icon-512.svg`
- `VPS/apps/admin-panel/src/main.jsx`
- `VPS/apps/admin-panel/src/styles.css`
- `VPS/apps/admin-panel/src/app/router.jsx`
- `VPS/apps/admin-panel/src/app/constants/navigation.js`
- `VPS/apps/admin-panel/src/app/layout/admin-layout.jsx`
- `VPS/apps/admin-panel/src/shared/api/http-client.js`
- `VPS/apps/admin-panel/src/shared/utils/permissions.js`
- `VPS/apps/admin-panel/src/shared/utils/formatters.js`
- `VPS/apps/admin-panel/src/shared/components/loading-block.jsx`
- `VPS/apps/admin-panel/src/shared/components/error-block.jsx`
- `VPS/apps/admin-panel/src/shared/components/empty-block.jsx`
- `VPS/apps/admin-panel/src/shared/components/modal.jsx`
- `VPS/apps/admin-panel/src/shared/components/status-badge.jsx`
- `VPS/apps/admin-panel/src/shared/components/page-header.jsx`
- `VPS/apps/admin-panel/src/modules/auth/auth.api.js`
- `VPS/apps/admin-panel/src/modules/auth/auth.store.js`
- `VPS/apps/admin-panel/src/modules/auth/use-auth-session.js`
- `VPS/apps/admin-panel/src/modules/auth/auth-guard.jsx`
- `VPS/apps/admin-panel/src/modules/auth/login-page.jsx`
- `VPS/apps/admin-panel/src/modules/catalogue/catalogue.api.js`
- `VPS/apps/admin-panel/src/modules/catalogue/catalogue-page.jsx`
- `VPS/apps/admin-panel/src/modules/categories/categories.api.js`
- `VPS/apps/admin-panel/src/modules/categories/categories-page.jsx`
- `VPS/apps/admin-panel/src/modules/products/products.api.js`
- `VPS/apps/admin-panel/src/modules/products/products-page.jsx`
- `VPS/apps/admin-panel/src/modules/hsn-tax/hsn-tax.api.js`
- `VPS/apps/admin-panel/src/modules/hsn-tax/hsn-tax-page.jsx`
- `VPS/apps/admin-panel/src/modules/inventory/inventory.api.js`
- `VPS/apps/admin-panel/src/modules/inventory/inventory-page.jsx`
- `VPS/apps/admin-panel/README.md`
- `VPS/package.json` (admin scripts)

Pending files/tasks after Phase 3 admin UI scope:
- Build front product listing/detail pages in `apps/front` using new public endpoints
- Add import/export workflow UI for CSV validation and upload in Phase 4
- Replace placeholder import API in backend once Phase 4 migration tooling is implemented

Phase 4 status update: `[~] Deferred` (by user decision on May 23, 2026)

Deferred notes:
- Full-site product migration crawler for `jenixindia.com` is deferred to final migration window.
- Phase 5+ backend development continues first to avoid blocking execution velocity.
- Phase 4 remains mandatory before go-live cutover and SEO redirect validation.

Phase 5 (Backend scope: Buyer-Intent Search) status: `[x]`

Completed files:
- `VPS/backend/src/database/search-store.js`
- `VPS/backend/src/modules/search/search.model.js`
- `VPS/backend/src/modules/search/search.validator.js`
- `VPS/backend/src/modules/search/search.permissions.js`
- `VPS/backend/src/modules/search/search.service.js`
- `VPS/backend/src/modules/search/search.controller.js`
- `VPS/backend/src/modules/search/search.routes.js`
- `VPS/backend/src/modules/search/regression-checklist.md`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.model.js`
- `VPS/backend/src/config/env.js`
- `VPS/.env.example`
- `VPS/backend/src/checks/run-regression-checks.js`

Pending files/tasks before full Phase 5 closure:
- Build admin search management UI in `apps/admin-panel` for synonyms, phrase mappings, redirects, zero-result monitoring, and reindex controls
- Build front search UX in `apps/front` (autocomplete, recent searches, recently viewed, suggested categories, direct product results)
- Add click/cart/purchase blended ranking once cart/order modules stabilize in later phases
- Add semantic/vector adapter integration (future-ready TODO)

Phase 6 (Backend + Front scope: Product Page UX and Recommendations) status: `[x]`

Completed backend files:
- `VPS/backend/src/modules/products/products.model.js`
- `VPS/backend/src/modules/products/products.validator.js`
- `VPS/backend/src/modules/products/products.service.js`
- `VPS/backend/src/modules/products/products.controller.js`
- `VPS/backend/src/modules/products/products.routes.js`
- `VPS/backend/src/modules/products/regression-checklist.md`
- `VPS/backend/src/checks/run-regression-checks.js`

Backend outcomes delivered:
- Product relations supported with ordered relation types:
  - `related`, `accessory`, `required_with`, `spare_part`, `similar`, `upgrade`, `frequently_bought_together`
- Admin relation update endpoint added: `PUT /api/admin/products/:productId/relations`
- Public product page bundle endpoint added: `GET /api/products/:slug/page`
- Public recommendations endpoint added: `GET /api/products/:slug/recommendations`
- Public shipping estimator endpoint added: `POST /api/products/:slug/shipping-estimate`
- Public responses keep stock quantity hidden (`stockQty` not exposed)
- Inactive related products are filtered from recommendation carousels
- Logged-in customer recent search/view payload included in recommendations bundle

Completed front files:
- `VPS/apps/front/package.json`
- `VPS/apps/front/vite.config.js`
- `VPS/apps/front/.env.example`
- `VPS/apps/front/index.html`
- `VPS/apps/front/public/icon-192.svg`
- `VPS/apps/front/public/icon-512.svg`
- `VPS/apps/front/src/main.jsx`
- `VPS/apps/front/src/styles.css`
- `VPS/apps/front/src/app/router.jsx`
- `VPS/apps/front/src/shared/api/http-client.js`
- `VPS/apps/front/src/modules/products/products.api.js`
- `VPS/apps/front/src/modules/products/products-list-page.jsx`
- `VPS/apps/front/src/modules/products/product-page.jsx`
- `VPS/apps/front/README.md`
- `VPS/package.json` (front scripts: `dev:front`, `build:front`)

Front outcomes delivered:
- React PWA front app scaffold activated in `apps/front`
- Product listing route wired to `/api/products`
- Product detail route wired with Phase 6 section order and mobile-first carousels
- Recommendation failure fallback implemented:
  - Main product still loads from `/api/products/:slug` even if recommendation bundle fails
- Shipping estimator wired to `/api/products/:slug/shipping-estimate`

Validation completed:
- `pnpm run check:backend` passed (including Phase 6 assertions)
- `pnpm run build:front` passed
- `pnpm run lint` passed

Pending files/tasks after Phase 6 closure:
- Phase 5 front search UX still pending:
  - autocomplete experience
  - search suggestion UI and query chip journey
  - zero-result recovery prompts on storefront
- Helpful guides/blog links are now backed by the Phase 13 blog/knowledge-base module

Phase 7 (Backend scope: Cart, Checkout, MOQ, Bulk Pricing, Stock Reservation) status: `[x]`

Completed files:
- `VPS/backend/src/modules/cart-checkout/cart-checkout.model.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.validator.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.service.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.controller.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.routes.js`
- `VPS/backend/src/modules/cart-checkout/regression-checklist.md`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/modules/auth/auth.service.js`
- `VPS/backend/src/database/auth-store.js`
- `VPS/backend/src/config/env.js`
- `VPS/.env.example`
- `VPS/backend/src/checks/run-regression-checks.js`

Delivered APIs (Phase 7 + extra cart-sharing feature):
- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:productId`
- `DELETE /api/cart/items/:productId`
- `POST /api/cart/merge`
- `POST /api/cart/share`
- `GET /api/cart/shared/:shareToken`
- `POST /api/cart/shared/:shareToken/claim`
- `POST /api/checkout/start`
- `GET /api/checkout/:checkoutSessionId`
- `POST /api/payments/create-attempt`
- `POST /api/payments/webhook/mock`

Phase 7 outcomes delivered:
- Guest cart, customer cart, and guest-to-user merge support implemented
- MOQ validation enforced at cart add/update and checkout validation
- Bulk slab pricing auto-applied in cart totals and checkout pricing
- Quote-required flow implemented (checkout blocked + quote request generated)
- Stock checks implemented at:
  - add to cart
  - cart update
  - checkout start
  - payment attempt creation
  - payment success webhook
- Stock reservation lifecycle implemented:
  - default reservation TTL 15 minutes
  - release on payment failure
  - timeout expiry cleanup
  - deduct stock on payment success
- GST on discounted taxable value, shipping charge, bank-transfer discount, and round-off included in pricing engine
- Exact stock quantity is not exposed in public cart/checkout payloads
- Extra feature delivered:
  - Cart share token + claim flow supports checkout/payment continuation on another device/session (mobile/desktop)

Validation completed:
- `pnpm run lint` passed
- `pnpm run check:backend` passed (includes Phase 7 assertions + cart-share cross-device flow)

Pending files/tasks after Phase 7 closure:
- Front cart and checkout UI wiring in `apps/front` to consume new `/api/cart`, `/api/checkout`, `/api/payments` APIs
- Replace mock payment webhook path with real gateway adapters in Phase 9

Phase 8 (Backend scope: Shipping Calculation and Courier Tracking) status: `[x]`

Completed files:
- `VPS/backend/src/database/shipping-store.js`
- `VPS/backend/src/modules/shipping/shipping.model.js`
- `VPS/backend/src/modules/shipping/shipping.validator.js`
- `VPS/backend/src/modules/shipping/shipping.permissions.js`
- `VPS/backend/src/modules/shipping/shipping-calculator.js`
- `VPS/backend/src/modules/shipping/shipping.service.js`
- `VPS/backend/src/modules/shipping/shipping.controller.js`
- `VPS/backend/src/modules/shipping/shipping.routes.js`
- `VPS/backend/src/modules/shipping/regression-checklist.md`
- `VPS/backend/src/integrations/shipping-providers/shipping-provider.adapter.js`
- `VPS/backend/src/integrations/shipping-providers/manual-courier.provider.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.model.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.validator.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.service.js`
- `VPS/backend/src/modules/products/products.service.js`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/checks/run-regression-checks.js`
- `VPS/backend/src/config/env.js`
- `VPS/.env.example`

Delivered APIs (Phase 8):
- `GET /api/admin/shipping/settings`
- `PATCH /api/admin/shipping/settings`
- `GET /api/admin/shipping/rate-cards`
- `POST /api/admin/shipping/rate-cards`
- `PATCH /api/admin/shipping/rate-cards/:rateCardId`
- `GET /api/admin/shipping/couriers`
- `POST /api/admin/shipping/couriers`
- `PATCH /api/admin/shipping/couriers/:courierProfileId`
- `GET /api/admin/shipping/queue`
- `POST /api/admin/shipping/shipments`
- `GET /api/admin/shipping/shipments/:shipmentId`
- `PATCH /api/admin/shipping/shipments/:shipmentId/tracking`
- `PATCH /api/admin/shipping/shipments/:shipmentId/status`
- `POST /api/admin/shipping/shipments/:shipmentId/tracking-email`
- `POST /api/admin/shipping/shipments/:shipmentId/pod`
- `GET /api/shipping/cart-estimate`
- `GET /api/shipping/tracking/:trackingId`

Phase 8 outcomes delivered:
- Cart shipping calculation is now zone/method/weight-driven and applied once at cart level
- Shipping charge stays separate from product pricing and supports remote pincode surcharge
- Standard/express/local pickup/self pickup/transport/manual delivery methods are supported
- Courier profile management supports manual tracking URL templates and future provider flags
- Paid orders flow into shipping queue and can move through manual shipment lifecycle
- Tracking email dispatch is logged through backend email-log simulation
- POD upload saves public URL and links it with shipment
- Delivered shipment status updates related order status
- Product shipping estimator now uses the Phase 8 rate matrix instead of fixed placeholder math

Validation completed:
- `pnpm run lint` passed
- `pnpm run check:backend` passed (includes all Phase 8 regression assertions)

Pending files/tasks after Phase 8 closure:
- Wire admin shipping UI screens in `apps/admin-panel` (rate cards, couriers, queue, tracking, POD)
- Wire front cart shipping estimator + tracking views in `apps/front`
- Add real courier API adapters in future phases (Shiprocket/Delhivery/DTDC/BlueDart)
- Implement actual email provider integration for tracking notifications in later notification phase

Phase 9 (Backend scope: Multi Payment Gateway and Manual Bank Transfer) status: `[x]`

Completed files:
- `VPS/backend/src/database/payment-store.js`
- `VPS/backend/src/database/json/payment-store.json`
- `VPS/backend/src/modules/payment-gateways/payment-gateways.model.js`
- `VPS/backend/src/modules/payment-gateways/payment-gateways.validator.js`
- `VPS/backend/src/modules/payment-gateways/payment-gateways.permissions.js`
- `VPS/backend/src/modules/payment-gateways/payment-gateways.service.js`
- `VPS/backend/src/modules/payment-gateways/payment-gateways.controller.js`
- `VPS/backend/src/modules/payment-gateways/payment-gateways.routes.js`
- `VPS/backend/src/modules/payment-gateways/regression-checklist.md`
- `VPS/backend/src/modules/manual-payments/manual-payments.model.js`
- `VPS/backend/src/modules/manual-payments/manual-payments.validator.js`
- `VPS/backend/src/modules/manual-payments/manual-payments.permissions.js`
- `VPS/backend/src/modules/manual-payments/manual-payments.service.js`
- `VPS/backend/src/modules/manual-payments/manual-payments.controller.js`
- `VPS/backend/src/modules/manual-payments/manual-payments.routes.js`
- `VPS/backend/src/modules/manual-payments/regression-checklist.md`
- `VPS/backend/src/integrations/payment-gateways/payment-gateway.adapter.js`
- `VPS/backend/src/integrations/payment-gateways/razorpay.gateway.js`
- `VPS/backend/src/integrations/payment-gateways/manual-upi.gateway.js`
- `VPS/backend/src/integrations/payment-gateways/bank-transfer.gateway.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.model.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.validator.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.service.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.controller.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.routes.js`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/config/env.js`
- `VPS/.env.example`
- `VPS/backend/src/checks/run-regression-checks.js`

Delivered APIs (Phase 9):
- `GET /api/admin/payment-gateways`
- `PATCH /api/admin/payment-gateways/:gatewayCode`
- `PATCH /api/admin/payment-gateways/discount/direct-payment`
- `POST /api/payments/manual/submit`
- `GET /api/admin/manual-payments`
- `POST /api/admin/manual-payments/:submissionId/verify`
- `POST /api/payments/webhook/:gateway`

Phase 9 outcomes delivered:
- Multi-gateway configuration store added with enable/disable, priority, mode, amount limits, and credentials placeholders.
- Gateway adapter interface expanded for create order, verify, webhook, refund, and payment status methods.
- Manual payment flow added with UTR + proof upload, pending verification queue, and admin approve/reject actions.
- Direct payment discount moved to configurable store-level policy instead of hard-coded method logic.
- Checkout/payment flow updated to support repeated attempts on the same checkout until payment success.
- Webhook processing made idempotent using processed-event dedupe to avoid duplicate paid-order handling.
- Manual payment verification now finalizes order payment status and consumes reserved stock only after admin approval.

Validation completed:
- `pnpm run lint` passed
- `pnpm run check:backend` passed (includes Phase 9 assertions for gateway controls, duplicate webhook idempotency, manual verification, and method-based discount rules)

Pending files/tasks after Phase 9 closure:
- Wire admin payment gateway and manual verification screens in `apps/admin-panel`
- Wire customer manual payment upload and status visibility in `apps/front`
- Replace current provider placeholders with production gateway credentials and signature verification hardening
- Add refund workflow UI and settlement reconciliation reporting in later payment/report phases

Phase 10 (Backend scope: GST Invoice, Tally Export, Invoice Settings) status: `[x]`

Completed files:
- `VPS/backend/src/database/invoice-store.js`
- `VPS/backend/src/modules/invoices/invoices.model.js`
- `VPS/backend/src/modules/invoices/invoices.validator.js`
- `VPS/backend/src/modules/invoices/invoices.permissions.js`
- `VPS/backend/src/modules/invoices/invoices.service.js`
- `VPS/backend/src/modules/invoices/invoices.controller.js`
- `VPS/backend/src/modules/invoices/invoices.routes.js`
- `VPS/backend/src/modules/invoices/regression-checklist.md`
- `VPS/backend/src/modules/tally-export/tally-export.model.js`
- `VPS/backend/src/modules/tally-export/tally-export.validator.js`
- `VPS/backend/src/modules/tally-export/tally-export.permissions.js`
- `VPS/backend/src/modules/tally-export/tally-export.service.js`
- `VPS/backend/src/modules/tally-export/tally-export.controller.js`
- `VPS/backend/src/modules/tally-export/tally-export.routes.js`
- `VPS/backend/src/modules/tally-export/regression-checklist.md`
- `VPS/backend/src/modules/settings/settings.model.js`
- `VPS/backend/src/modules/settings/settings.validator.js`
- `VPS/backend/src/modules/settings/settings.service.js`
- `VPS/backend/src/modules/settings/settings.controller.js`
- `VPS/backend/src/modules/settings/settings.routes.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.model.js`
- `VPS/backend/src/modules/cart-checkout/cart-checkout.service.js`
- `VPS/backend/src/modules/manual-payments/manual-payments.service.js`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/config/env.js`
- `VPS/.env.example`
- `VPS/backend/src/checks/run-regression-checks.js`

Delivered APIs (Phase 10):
- `PUT /api/admin/settings/invoice-settings`
- `POST /api/admin/settings/invoice-settings/upload/:assetKey`
- `GET /api/admin/invoices`
- `GET /api/admin/invoices/order/:orderId`
- `POST /api/admin/invoices/order/:orderId/generate`
- `GET /api/admin/invoices/:invoiceId`
- `GET /api/admin/invoices/:invoiceId/download`
- `GET /api/admin/tally-export`

Phase 10 outcomes delivered:
- Invoice settings added for prefix/postfix, financial year format, starting number, padding, footer, terms, signatory image, bank detail visibility, HSN summary visibility, shipping/discount lines, and custom invoice fields.
- Dedicated invoice store added with financial-year sequence tracking and locked invoice snapshots.
- GST split logic implemented:
  - same-state buyer -> CGST + SGST
  - different-state buyer -> IGST
- Paid online webhook success now auto-generates exactly one invoice per order.
- Manual payment approval now auto-generates exactly one invoice after admin verification.
- Invoice snapshot includes seller details, buyer details, GSTIN, place of supply, HSN, SKU, final unit price, taxable value, GST split, shipping line, discount line, round-off, grand total, amount in words, payment status, terms, and custom fields.
- Tally CSV export added with selected date range filtering and monthly/yearly period support.
- XML export remains future-ready TODO and is explicitly flagged as not yet enabled.

Validation completed:
- `node node_modules/eslint/bin/eslint.js backend/src` passed
- `node backend/src/checks/run-regression-checks.js` passed (includes Phase 10 assertions for sequential invoice numbering, same-state vs inter-state GST split, invoice lock/idempotent regenerate, duplicate webhook invoice safety, custom fields, round-off, and Tally CSV totals)

Pending files/tasks after Phase 10 closure:
- Wire admin invoice settings, invoice list, and Tally export screens in `apps/admin-panel`
- Replace current JSON placeholder invoice download payload with actual PDF/HTML invoice rendering

Phase 11 outcomes delivered:
- Added `customer-account` backend module with protected customer profile, orders, invoices, tracking, address book, GST details, saved products, guest-order linking, and reorder APIs.
- Reorder now recalculates current pricing, MOQ, GST, shipping, and stock using the original order shipping/payment context instead of reusing stale order values.
- Extended regression coverage for:
  - own order visibility
  - blocked access to another customer order
  - customer invoice download
  - verified-only guest order linking
  - reorder price recalculation
  - shipment tracking visibility after admin update
- Added front-end customer session persistence plus new `apps/front` routes for:
  - `/account/login`
  - `/account`
  - `/account/orders/:orderId`
- Delivered customer account UI sections for profile, orders, invoices, tracking, addresses, GST details, recently viewed, recent searches, saved products, guest-order linking, and support contact actions.
- Added product-page account entry and save-product actions tied to the new customer account APIs.

Validation completed after Phase 11:
- `node node_modules\eslint\bin\eslint.js backend\src` passed
- `node node_modules\vite\bin\vite.js build` passed in `VPS/apps/front`
- `node backend\src\checks\run-regression-checks.js` passed with Phase 11 assertions enabled

Phase 13 (Backend + Front + Admin scope: Blog / Knowledge Base) status: `[x]`

Completed files:
- `VPS/backend/src/database/content-store.js`
- `VPS/backend/src/modules/blogs/blogs.model.js`
- `VPS/backend/src/modules/blogs/blogs.validator.js`
- `VPS/backend/src/modules/blogs/blogs.permissions.js`
- `VPS/backend/src/modules/blogs/blogs.service.js`
- `VPS/backend/src/modules/blogs/blogs.controller.js`
- `VPS/backend/src/modules/blogs/blogs.routes.js`
- `VPS/backend/src/modules/blogs/regression-checklist.md`
- `VPS/backend/src/modules/products/products.service.js`
- `VPS/backend/src/modules/search/search.service.js`
- `VPS/backend/src/modules/roles-permissions/roles-permissions.model.js`
- `VPS/backend/src/routes/index.js`
- `VPS/backend/src/app.js`
- `VPS/backend/src/config/env.js`
- `VPS/backend/src/checks/run-regression-checks.js`
- `VPS/.env.example`
- `VPS/apps/front/src/modules/blogs/blogs.api.js`
- `VPS/apps/front/src/modules/blogs/blogs-list-page.jsx`
- `VPS/apps/front/src/modules/blogs/blog-page.jsx`
- `VPS/apps/front/src/modules/products/products.api.js`
- `VPS/apps/front/src/modules/products/products-list-page.jsx`
- `VPS/apps/front/src/modules/products/product-page.jsx`
- `VPS/apps/front/src/app/router.jsx`
- `VPS/apps/front/src/styles.css`
- `VPS/apps/admin-panel/src/modules/blogs/blogs.api.js`
- `VPS/apps/admin-panel/src/modules/blogs/blogs-page.jsx`
- `VPS/apps/admin-panel/src/app/constants/navigation.js`
- `VPS/apps/admin-panel/src/app/layout/admin-layout.jsx`
- `VPS/apps/admin-panel/src/app/router.jsx`
- `VPS/apps/admin-panel/src/shared/components/status-badge.jsx`

Delivered APIs (Phase 13):
- `GET /sitemap.xml`
- `GET /api/admin/blogs/categories`
- `GET /api/admin/blogs`
- `GET /api/admin/blogs/:blogId`
- `POST /api/admin/blogs`
- `PATCH /api/admin/blogs/:blogId`
- `DELETE /api/admin/blogs/:blogId`
- `GET /api/blogs/categories`
- `GET /api/blogs`
- `GET /api/blogs/:slug`

Phase 13 outcomes delivered:
- Added a dedicated blog / knowledge-base backend module with seeded guide categories and draft/published/archived content workflow.
- Public guide detail now includes related products, related catalogue categories, related blogs, FAQ content, Article JSON-LD, and FAQ schema payloads.
- Published guide URLs are now included in `/sitemap.xml`.
- Product-page helpful guides are now powered by linked blogs instead of placeholder content.
- Storefront search now returns mixed product/blog results, and search suggestions include published guide titles.
- Added front-end knowledge-base routes:
  - `/guides`
  - `/guides/:slug`
- Added admin blog management route:
  - `/blogs`
- Blog linking supports:
  - `linkedProductIds`
  - `linkedCategoryIds`
  - `relatedBlogIds`

Validation completed after Phase 13:
- `node backend/src/checks/run-regression-checks.js` passed
- `node node_modules/eslint/bin/eslint.js backend/src` passed
- `node node_modules/vite/bin/vite.js build` passed in `VPS/apps/front`
- `node node_modules/vite/bin/vite.js build` passed in `VPS/apps/admin-panel`

Phase 14 (Backend + Storefront SEO/feed scope) status: `[x]`

Completed files:
- `VPS/backend/src/app.js`
- `VPS/backend/src/checks/run-regression-checks.js`
- `VPS/backend/src/modules/products/products.service.js`
- `VPS/backend/src/modules/seo/seo.model.js`
- `VPS/backend/src/modules/seo/seo.validator.js`
- `VPS/backend/src/modules/seo/seo.service.js`
- `VPS/backend/src/modules/seo/seo.controller.js`
- `VPS/backend/src/modules/seo/seo.routes.js`
- `VPS/backend/src/modules/seo/regression-checklist.md`
- `VPS/backend/src/modules/google-merchant/google-merchant.model.js`
- `VPS/backend/src/modules/google-merchant/google-merchant.validator.js`
- `VPS/backend/src/modules/google-merchant/google-merchant.service.js`
- `VPS/backend/src/modules/google-merchant/google-merchant.controller.js`
- `VPS/backend/src/modules/google-merchant/google-merchant.routes.js`
- `VPS/backend/src/modules/google-merchant/regression-checklist.md`
- `VPS/apps/front/src/modules/products/product-page.jsx`

Delivered APIs (Phase 14):
- `GET /sitemap.xml`
- `GET /sitemaps/products.xml`
- `GET /sitemaps/categories.xml`
- `GET /sitemaps/blogs.xml`
- `GET /google-merchant-feed.xml`

Phase 14 outcomes delivered:
- Replaced the single guide-only sitemap with a sitemap index plus dedicated product, category, and blog sitemaps.
- Added a Google Merchant XML feed for active products with merchant-ready title/description, price and sale price, availability, shipping weight, category/type, and identifier flags.
- Product page payloads now include SEO metadata plus Product, Offer, and Breadcrumb JSON-LD for storefront rendering.
- Offer structured data now includes a conditional no-return policy signal when invoice terms explicitly mark goods as non-returnable.
- Storefront product pages now render the product structured-data scripts and use the SEO payload title.
- Regression coverage now verifies product schema payloads, active-only merchant feed output, website/feed price alignment, separate shipping estimate behavior, shipping weight, sitemap coverage, and out-of-stock availability.

Validation completed after Phase 14:
- `node backend/src/checks/run-regression-checks.js` passed
- `node node_modules/eslint/bin/eslint.js backend/src` passed
- `node node_modules/vite/bin/vite.js build` passed in `VPS/apps/front`

Pending files/tasks after Phase 14 closure:
- Replace current URL-based blog image fields with upload workflow if content editors need asset management inside admin
- Add explicit admin-configurable shipping/return policy settings if richer merchant structured data is needed later
- Add Facebook product feed when marketing/feed work is expanded in a later phase

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

Implement Phase 1 â€” Core Settings, Branding, Store Profile.

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






