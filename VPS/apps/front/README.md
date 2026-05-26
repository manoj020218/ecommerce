# Jenix Front App (Phase 6)

Customer-facing React PWA wired to backend APIs.

Implemented in Phase 6:

- Product listing route: `/`
- Product detail route: `/products/:slug`
- Product page UX wiring:
  - breadcrumb
  - gallery + title + pricing + MOQ/bulk slabs
  - availability status (without exact stock quantity)
  - quantity selector + primary CTAs
  - shipping estimator (`/api/products/:slug/shipping-estimate`)
  - key features / description / specs / downloads tabs
  - recent searches/viewed
  - related/accessory/frequently bought/top searched/most visited carousels
  - helpful guides strip

Environment:

- Copy `.env.example` to `.env` if custom API base URL is needed.
