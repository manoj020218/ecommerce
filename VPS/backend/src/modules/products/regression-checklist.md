# Phase 3 Products Regression Checklist

- [ ] Product can be created with HSN code and auto SKU.
- [ ] HSN GST rate auto-applies to product.
- [ ] Product image upload returns usable URL.
- [ ] Public product API does not expose exact `stockQty`.
- [ ] Admin product API includes stock fields.
- [ ] Inactive product is hidden from public API.

# Phase 6 Product Page and Recommendations Checklist

- [ ] Product page payload endpoint returns product + breadcrumb + recommendation sections.
- [ ] Product page payload keeps stock quantity hidden from public response.
- [ ] Admin product relation order is preserved in recommendation carousels.
- [ ] Inactive related products are filtered out from public recommendation groups.
- [ ] Logged-in customers receive recent searches/recently viewed products in recommendations.
- [ ] Shipping estimator endpoint responds with quote preview and no stock exposure.
