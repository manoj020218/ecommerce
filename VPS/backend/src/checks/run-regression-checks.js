const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../app");
const { resetCatalogStoreForRegression } = require("../database/catalog-store");
const { resetInvoiceStoreForRegression } = require("../database/invoice-store");
const { resetPaymentStoreForRegression } = require("../database/payment-store");
const { resetRecoveryStoreForRegression } = require("../database/recovery-store");
const { resetSearchStoreForRegression } = require("../database/search-store");
const { resetShippingStoreForRegression } = require("../database/shipping-store");
const { jsonFileStore } = require("../database/json-file-store");
const { resetAuthStoreForRegression } = require("../database/auth-store");
const { ensureAuthBootstrap } = require("../modules/auth/auth.service");

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

function authHeaders(accessToken) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`
  };
}

async function run() {
  await jsonFileStore.resetSettingsForRegression();
  await resetCatalogStoreForRegression();
  await resetInvoiceStoreForRegression();
  await resetPaymentStoreForRegression();
  await resetRecoveryStoreForRegression();
  await resetSearchStoreForRegression();
  await resetShippingStoreForRegression();
  await resetAuthStoreForRegression();
  await ensureAuthBootstrap();

  const app = createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const serverInfo = server.address();
  const baseUrl = `http://127.0.0.1:${serverInfo.port}`;

  try {
    const health = await requestJson(baseUrl, "/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.json.success, true);

    const guestBrowse = await requestJson(baseUrl, "/api/auth/public/browse");
    assert.equal(guestBrowse.response.status, 200);
    assert.equal(guestBrowse.json.data.browse, true);

    const guestSearch = await requestJson(baseUrl, "/api/auth/public/search?q=gate");
    assert.equal(guestSearch.response.status, 200);
    assert.equal(Array.isArray(guestSearch.json.data.matches), true);

    const guestAddCart = await requestJson(
      baseUrl,
      "/api/auth/public/guest-cart/items",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "guest-session-1",
          productId: "product-100",
          qty: 2
        })
      }
    );
    assert.equal(guestAddCart.response.status, 201);

    const adminLogin = await requestJson(baseUrl, "/api/auth/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@jenixindia.com",
        password: "ChangeMe@123"
      })
    });
    assert.equal(adminLogin.response.status, 200);
    assert.equal(Boolean(adminLogin.json.data.accessToken), true);
    const superAdminToken = adminLogin.json.data.accessToken;

    const createCategory = await requestJson(baseUrl, "/api/admin/categories", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        name: "CCTV",
        description: "CCTV category",
        isActive: true
      })
    });
    assert.equal(createCategory.response.status, 201);
    const categoryId = createCategory.json.data.id;

    const createHsnRecord = await requestJson(baseUrl, "/api/admin/hsn-tax", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        hsnCode: "8525",
        description: "CCTV Cameras",
        gstRate: 18,
        effectiveFrom: "2026-04-01"
      })
    });
    assert.equal(createHsnRecord.response.status, 201);

    const createProduct = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Smart CCTV Camera",
        categoryId,
        hsnCode: "8525",
        basePrice: 5000,
        salePrice: 4500,
        stockQty: 8,
        lowStockThreshold: 10,
        customerKeywords: ["shop camera", "security camera"],
        problemStatements: ["dukan ke liye camera"]
      })
    });
    assert.equal(createProduct.response.status, 201);
    assert.equal(createProduct.json.data.sku.startsWith("JNX-"), true);
    assert.equal(createProduct.json.data.gstRate, 18);
    const createdProductId = createProduct.json.data.id;
    const createdProductSlug = createProduct.json.data.slug;

    const createRelatedA = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "PoE Switch 8 Port",
        categoryId,
        hsnCode: "8525",
        basePrice: 3400,
        salePrice: 3200,
        stockQty: 12,
        lowStockThreshold: 3
      })
    });
    assert.equal(createRelatedA.response.status, 201);
    const relatedAId = createRelatedA.json.data.id;

    const createRelatedB = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "NVR 8 Channel 4K",
        categoryId,
        hsnCode: "8525",
        basePrice: 9000,
        salePrice: 8500,
        stockQty: 10,
        lowStockThreshold: 2
      })
    });
    assert.equal(createRelatedB.response.status, 201);
    const relatedBId = createRelatedB.json.data.id;

    const createInactiveRelated = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Legacy DVR Recorder",
        categoryId,
        hsnCode: "8525",
        basePrice: 4200,
        salePrice: 3990,
        stockQty: 2,
        isActive: false
      })
    });
    assert.equal(createInactiveRelated.response.status, 201);
    const inactiveRelatedId = createInactiveRelated.json.data.id;

    const createBulkProduct = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "AI NVR Enterprise Kit",
        categoryId,
        hsnCode: "8525",
        basePrice: 5200,
        salePrice: 5000,
        moq: 2,
        bulkPricingEnabled: true,
        bulkPriceSlabs: [
          { minQty: 5, unitPrice: 4600 },
          { minQty: 10, unitPrice: 4300 }
        ],
        quoteRequiredAboveQty: 8,
        stockQty: 30,
        lowStockThreshold: 3
      })
    });
    assert.equal(createBulkProduct.response.status, 201);
    const bulkProductId = createBulkProduct.json.data.id;

    const createTightStockProduct = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Single Unit Trial Camera",
        categoryId,
        hsnCode: "8525",
        basePrice: 2100,
        salePrice: 1999,
        moq: 1,
        stockQty: 1,
        lowStockThreshold: 1
      })
    });
    assert.equal(createTightStockProduct.response.status, 201);
    const tightStockProductId = createTightStockProduct.json.data.id;

    const createSearchSynonym = await requestJson(
      baseUrl,
      "/api/admin/search/synonyms",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          term: "camera",
          synonyms: ["cam", "cctv camera"],
          language: "mixed"
        })
      }
    );
    assert.equal(createSearchSynonym.response.status, 201);

    const createBuyerPhraseMapping = await requestJson(
      baseUrl,
      "/api/admin/search/buyer-phrases",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          phrase: "dukan ke liye camera",
          productIds: [createdProductId],
          weight: 90,
          notes: "Phase 5 intent mapping"
        })
      }
    );
    assert.equal(createBuyerPhraseMapping.response.status, 201);

    const createKeywordMapping = await requestJson(
      baseUrl,
      "/api/admin/search/product-keywords",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          productId: createdProductId,
          keywords: ["shop camera", "retail cctv"],
          useCases: ["shop security", "counter monitoring"],
          problemStatements: ["dukan pe nazar rakhna"]
        })
      }
    );
    assert.equal(createKeywordMapping.response.status, 201);

    const createSearchRedirect = await requestJson(
      baseUrl,
      "/api/admin/search/redirects",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          fromQuery: "smart cctv help",
          toType: "product",
          toValue: createdProductSlug
        })
      }
    );
    assert.equal(createSearchRedirect.response.status, 201);

    const searchExact = await requestJson(
      baseUrl,
      `/api/search?q=${encodeURIComponent("smart cctv camera")}&limit=5`
    );
    assert.equal(searchExact.response.status, 200);
    assert.equal(searchExact.json.data.results.length > 0, true);
    assert.equal(searchExact.json.data.results[0].id, createdProductId);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        searchExact.json.data.results[0].product,
        "stockQty"
      ),
      false
    );

    const searchIntent = await requestJson(
      baseUrl,
      `/api/search?q=${encodeURIComponent("dukan ke liye camera")}&limit=5`
    );
    assert.equal(searchIntent.response.status, 200);
    assert.equal(searchIntent.json.data.results.length > 0, true);
    assert.equal(searchIntent.json.data.results[0].id, createdProductId);

    const searchRedirect = await requestJson(
      baseUrl,
      `/api/search?q=${encodeURIComponent("smart cctv help")}&limit=5`
    );
    assert.equal(searchRedirect.response.status, 200);
    assert.equal(searchRedirect.json.data.redirect.toType, "product");
    assert.equal(searchRedirect.json.data.redirect.toValue, createdProductSlug);

    const searchSuggest = await requestJson(
      baseUrl,
      `/api/search/suggest?q=${encodeURIComponent("smart")}&limit=5`
    );
    assert.equal(searchSuggest.response.status, 200);
    assert.equal(Array.isArray(searchSuggest.json.data.suggestions), true);

    const tinyPngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AApMBgQnUnx0AAAAASUVORK5CYII=",
      "base64"
    );
    const imageFormData = new FormData();
    imageFormData.append(
      "file",
      new Blob([tinyPngBytes], { type: "image/png" }),
      "product.png"
    );

    const imageUploadResponse = await fetch(
      `${baseUrl}/api/admin/products/${createdProductId}/images`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${superAdminToken}`
        },
        body: imageFormData
      }
    );
    const imageUploadJson = await imageUploadResponse.json();
    assert.equal(imageUploadResponse.status, 201);
    assert.equal(Boolean(imageUploadJson.data.imageUrl), true);

    const adminProductDetails = await requestJson(
      baseUrl,
      `/api/admin/products/${createdProductId}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(adminProductDetails.response.status, 200);
    assert.equal(
      Object.prototype.hasOwnProperty.call(adminProductDetails.json.data, "stockQty"),
      true
    );

    const publicProductDetails = await requestJson(
      baseUrl,
      `/api/products/${createdProductSlug}`
    );
    assert.equal(publicProductDetails.response.status, 200);
    assert.equal(
      Object.prototype.hasOwnProperty.call(publicProductDetails.json.data, "stockQty"),
      false
    );

    const lowStockAlerts = await requestJson(
      baseUrl,
      "/api/admin/inventory/low-stock",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(lowStockAlerts.response.status, 200);
    assert.equal(
      lowStockAlerts.json.data.some((row) => row.id === createdProductId),
      true
    );

    const patchStoreProfile = await requestJson(
      baseUrl,
      "/api/admin/settings/store-profile",
      {
        method: "PUT",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          storeName: "Jenix India Pvt Ltd",
          legalBusinessName: "Jenix India Private Limited",
          gstin: "07ABCDE1234F1Z5",
          address: "Plot 21, Kirti Nagar, New Delhi",
          state: "Delhi",
          stateCode: "DL",
          supportEmail: "support@jenixindia.com",
          supportMobile: "+91-9999988888",
          bankName: "Jenix Commerce Bank",
          accountHolderName: "Jenix India Pvt Ltd",
          accountNumber: "111122223333",
          ifsc: "JENX0000123",
          upiId: "payments@jenixindia"
        })
      }
    );
    assert.equal(patchStoreProfile.response.status, 200);
    assert.equal(patchStoreProfile.json.data.storeName, "Jenix India Pvt Ltd");

    const patchInvoiceSettings = await requestJson(
      baseUrl,
      "/api/admin/settings/invoice-settings",
      {
        method: "PUT",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          invoicePrefix: "JNX",
          financialYearFormat: "YYYY-YY",
          invoiceStartingNumber: 1,
          invoiceNumberPadding: 6,
          invoiceFooter: "Thank you for choosing Jenix India.",
          invoiceTerms: "Goods once sold will not be taken back.",
          showBankDetails: true,
          showHsnSummary: true,
          showShippingLine: true,
          showDiscountLine: true,
          customInvoiceFields: [
            {
              label: "Project Code",
              value: "DELHI-OPS-01"
            }
          ]
        })
      }
    );
    assert.equal(patchInvoiceSettings.response.status, 200);
    assert.equal(patchInvoiceSettings.json.data.invoicePrefix, "JNX");

    const publicStoreProfile = await requestJson(
      baseUrl,
      "/api/settings/store-profile"
    );
    assert.equal(publicStoreProfile.response.status, 200);
    assert.equal(publicStoreProfile.json.data.storeName, "Jenix India Pvt Ltd");
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        publicStoreProfile.json.data,
        "accountNumber"
      ),
      false
    );

    const publicCategories = await requestJson(baseUrl, "/api/categories");
    assert.equal(publicCategories.response.status, 200);
    assert.equal(
      publicCategories.json.data.some((row) => row.id === categoryId),
      true
    );

    const customerRegister = await requestJson(
      baseUrl,
      "/api/auth/customer/register-email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Ravi Customer",
          email: "ravi@example.com",
          password: "RaviPass@123",
          guestSessionId: "guest-session-1"
        })
      }
    );
    assert.equal(customerRegister.response.status, 201);
    assert.equal(customerRegister.json.data.mergedGuestCart, true);
    const customerToken = customerRegister.json.data.accessToken;

    const customerCart = await requestJson(baseUrl, "/api/auth/customer/cart", {
      headers: authHeaders(customerToken)
    });
    assert.equal(customerCart.response.status, 200);
    assert.equal(customerCart.json.data.items.length > 0, true);

    const customerSearch = await requestJson(
      baseUrl,
      `/api/search?q=${encodeURIComponent("shop camera")}&limit=5`,
      {
        headers: authHeaders(customerToken)
      }
    );
    assert.equal(customerSearch.response.status, 200);

    const trackClick = await requestJson(baseUrl, "/api/search/click", {
      method: "POST",
      headers: authHeaders(customerToken),
      body: JSON.stringify({
        query: "shop camera",
        productId: createdProductId,
        position: 1
      })
    });
    assert.equal(trackClick.response.status, 201);

    const trackView = await requestJson(baseUrl, "/api/search/view", {
      method: "POST",
      headers: authHeaders(customerToken),
      body: JSON.stringify({
        productId: createdProductId
      })
    });
    assert.equal(trackView.response.status, 201);

    const customerSearchHistory = await requestJson(
      baseUrl,
      "/api/search/history?limit=10",
      {
        headers: authHeaders(customerToken)
      }
    );
    assert.equal(customerSearchHistory.response.status, 200);
    assert.equal(customerSearchHistory.json.data.length > 0, true);

    const customerViewedHistory = await requestJson(
      baseUrl,
      "/api/search/recent-viewed?limit=10",
      {
        headers: authHeaders(customerToken)
      }
    );
    assert.equal(customerViewedHistory.response.status, 200);
    assert.equal(customerViewedHistory.json.data.length > 0, true);

    const updateProductRelations = await requestJson(
      baseUrl,
      `/api/admin/products/${createdProductId}/relations`,
      {
        method: "PUT",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          related: [relatedBId, inactiveRelatedId, relatedAId],
          accessory: [relatedAId],
          frequently_bought_together: [relatedBId]
        })
      }
    );
    assert.equal(updateProductRelations.response.status, 200);

    const customerProductPage = await requestJson(
      baseUrl,
      `/api/products/${createdProductSlug}/page?limitPerGroup=10&historyLimit=10`,
      {
        headers: authHeaders(customerToken)
      }
    );
    assert.equal(customerProductPage.response.status, 200);
    assert.equal(customerProductPage.json.data.product.id, createdProductId);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        customerProductPage.json.data.product,
        "stockQty"
      ),
      false
    );
    assert.equal(customerProductPage.json.data.recommendations.recently.viewedProducts.length > 0, true);

    const productRecommendations = await requestJson(
      baseUrl,
      `/api/products/${createdProductSlug}/recommendations?limitPerGroup=10&historyLimit=10`,
      {
        headers: authHeaders(customerToken)
      }
    );
    assert.equal(productRecommendations.response.status, 200);
    assert.equal(
      productRecommendations.json.data.recommendationGroups.related[0].id,
      relatedBId
    );
    assert.equal(
      productRecommendations.json.data.recommendationGroups.related.some(
        (row) => row.id === inactiveRelatedId
      ),
      false
    );

    const recommendationFailure = await requestJson(
      baseUrl,
      `/api/products/${createdProductSlug}/recommendations?limitPerGroup=99`
    );
    assert.equal(recommendationFailure.response.status, 400);

    const productStillLoads = await requestJson(
      baseUrl,
      `/api/products/${createdProductSlug}`
    );
    assert.equal(productStillLoads.response.status, 200);

    const shippingEstimate = await requestJson(
      baseUrl,
      `/api/products/${createdProductSlug}/shipping-estimate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pincode: "110001",
          quantity: 3
        })
      }
    );
    assert.equal(shippingEstimate.response.status, 200);
    assert.equal(shippingEstimate.json.data.options.length >= 2, true);

    const phase7GuestAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-guest-1",
        productId: createdProductId,
        qty: 2
      })
    });
    assert.equal(phase7GuestAdd.response.status, 201);
    assert.equal(phase7GuestAdd.json.data.itemCount, 2);

    const phase7GuestView = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase7-guest-1"
    );
    assert.equal(phase7GuestView.response.status, 200);
    assert.equal(phase7GuestView.json.data.itemCount, 2);

    const phase7MergeGuestSeed = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-merge-guest",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase7MergeGuestSeed.response.status, 201);

    const phase7MergeGuest = await requestJson(baseUrl, "/api/cart/merge", {
      method: "POST",
      headers: authHeaders(customerToken),
      body: JSON.stringify({
        guestSessionId: "phase7-merge-guest"
      })
    });
    assert.equal(phase7MergeGuest.response.status, 200);
    assert.equal(phase7MergeGuest.json.data.merged, true);

    const phase7MoqFail = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-moq",
        productId: bulkProductId,
        qty: 1
      })
    });
    assert.equal(phase7MoqFail.response.status, 400);

    const phase7BulkAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-bulk",
        productId: bulkProductId,
        qty: 5
      })
    });
    assert.equal(phase7BulkAdd.response.status, 201);
    assert.equal(phase7BulkAdd.json.data.items[0].unitPrice, 4600);

    const phase7BulkQuoteQty = await requestJson(
      baseUrl,
      `/api/cart/items/${bulkProductId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "phase7-bulk",
          qty: 8
        })
      }
    );
    assert.equal(phase7BulkQuoteQty.response.status, 200);

    const phase7QuoteCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-bulk",
        paymentMethod: "online",
        shippingMethod: "standard"
      })
    });
    assert.equal(phase7QuoteCheckout.response.status, 200);
    assert.equal(phase7QuoteCheckout.json.data.checkoutBlocked, true);
    assert.equal(phase7QuoteCheckout.json.data.reason, "quote_required");

    const phase7ReserveCartA = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-a",
        productId: tightStockProductId,
        qty: 1
      })
    });
    assert.equal(phase7ReserveCartA.response.status, 201);

    const phase7CheckoutA = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-a",
        paymentMethod: "online",
        shippingMethod: "standard"
      })
    });
    assert.equal(phase7CheckoutA.response.status, 200);
    assert.equal(phase7CheckoutA.json.data.checkoutBlocked, false);
    assert.equal(phase7CheckoutA.json.data.reservation.status, "active");
    const phase7CheckoutAId = phase7CheckoutA.json.data.checkoutSession.id;

    const phase7ReservedInventory = await requestJson(
      baseUrl,
      `/api/admin/inventory/products/${tightStockProductId}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase7ReservedInventory.response.status, 200);
    assert.equal(phase7ReservedInventory.json.data.reservedQty, 1);

    const phase7AttemptA = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-a",
        checkoutSessionId: phase7CheckoutAId,
        gateway: "mock_online"
      })
    });
    assert.equal(phase7AttemptA.response.status, 201);

    const phase7FailWebhook = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase7AttemptA.json.data.attemptId,
        status: "failed",
        failureReason: "user_cancelled"
      })
    });
    assert.equal(phase7FailWebhook.response.status, 200);
    assert.equal(phase7FailWebhook.json.data.status, "failed");

    const phase7ReservedReleased = await requestJson(
      baseUrl,
      `/api/admin/inventory/products/${tightStockProductId}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase7ReservedReleased.response.status, 200);
    assert.equal(phase7ReservedReleased.json.data.reservedQty, 0);

    const phase7ReserveCartB1 = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-b1",
        productId: tightStockProductId,
        qty: 1
      })
    });
    assert.equal(phase7ReserveCartB1.response.status, 201);

    const phase7ReserveCartB2 = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-b2",
        productId: tightStockProductId,
        qty: 1
      })
    });
    assert.equal(phase7ReserveCartB2.response.status, 201);

    const phase7CheckoutB1 = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-b1",
        paymentMethod: "online",
        shippingMethod: "standard"
      })
    });
    assert.equal(phase7CheckoutB1.response.status, 200);
    assert.equal(phase7CheckoutB1.json.data.checkoutBlocked, false);

    const phase7CheckoutB2 = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-b2",
        paymentMethod: "online",
        shippingMethod: "standard"
      })
    });
    assert.equal(phase7CheckoutB2.response.status, 409);

    const phase7AttemptB1 = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-res-b1",
        checkoutSessionId: phase7CheckoutB1.json.data.checkoutSession.id,
        gateway: "mock_online"
      })
    });
    assert.equal(phase7AttemptB1.response.status, 201);

    const phase7CleanupB1 = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase7AttemptB1.json.data.attemptId,
        status: "failed",
        failureReason: "cleanup_release"
      })
    });
    assert.equal(phase7CleanupB1.response.status, 200);

    const phase7ShareSourceAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-share-source",
        productId: bulkProductId,
        qty: 5
      })
    });
    assert.equal(phase7ShareSourceAdd.response.status, 201);

    const phase7ShareLink = await requestJson(baseUrl, "/api/cart/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-share-source",
        expiresInMinutes: 60
      })
    });
    assert.equal(phase7ShareLink.response.status, 201);
    const sharedToken = phase7ShareLink.json.data.shareToken;

    const phase7SharedFetch = await requestJson(
      baseUrl,
      `/api/cart/shared/${sharedToken}`
    );
    assert.equal(phase7SharedFetch.response.status, 200);
    assert.equal(phase7SharedFetch.json.data.cart.itemCount > 0, true);

    const phase7Claim = await requestJson(
      baseUrl,
      `/api/cart/shared/${sharedToken}/claim`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetSessionId: "phase7-share-target",
          mode: "replace"
        })
      }
    );
    assert.equal(phase7Claim.response.status, 200);
    assert.equal(phase7Claim.json.data.claimed, true);

    const phase7ShareCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase7-share-target",
        paymentMethod: "direct_bank_transfer",
        shippingMethod: "standard"
      })
    });
    assert.equal(phase7ShareCheckout.response.status, 200);
    assert.equal(phase7ShareCheckout.json.data.checkoutBlocked, false);

    const phase8CartSeed = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase8-cart",
        productId: createdProductId,
        qty: 3
      })
    });
    assert.equal(phase8CartSeed.response.status, 201);

    const phase8StandardCart = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase8-cart&shippingMethod=standard&shippingPincode=110001&shippingStateCode=DL"
    );
    assert.equal(phase8StandardCart.response.status, 200);
    assert.equal(phase8StandardCart.json.data.pricing.shippingCharge > 0, true);
    assert.equal(
      phase8StandardCart.json.data.items.some((item) =>
        Object.prototype.hasOwnProperty.call(item, "shippingCharge")
      ),
      false
    );

    const phase8ExpressCart = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase8-cart&shippingMethod=express&shippingPincode=110001&shippingStateCode=DL"
    );
    assert.equal(phase8ExpressCart.response.status, 200);
    assert.equal(
      phase8ExpressCart.json.data.pricing.shippingCharge >
        phase8StandardCart.json.data.pricing.shippingCharge,
      true
    );

    const phase8RemoteCart = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase8-cart&shippingMethod=standard&shippingPincode=793001&shippingStateCode=ML"
    );
    assert.equal(phase8RemoteCart.response.status, 200);
    assert.equal(
      phase8RemoteCart.json.data.pricing.shippingCharge >
        phase8StandardCart.json.data.pricing.shippingCharge,
      true
    );
    assert.equal(
      Number(phase8RemoteCart.json.data.pricing.shippingMeta.remoteExtraCharge || 0) > 0,
      true
    );

    const phase8OrderSeed = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase8-order",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase8OrderSeed.response.status, 201);

    const phase8Checkout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase8-order",
        paymentMethod: "online",
        shippingMethod: "standard",
        shippingAddress: {
          email: "buyer.phase8@example.com",
          pincode: "110001",
          stateCode: "DL"
        }
      })
    });
    assert.equal(phase8Checkout.response.status, 200);
    assert.equal(phase8Checkout.json.data.checkoutBlocked, false);
    const phase8CheckoutSessionId = phase8Checkout.json.data.checkoutSession.id;

    const phase8Attempt = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase8-order",
        checkoutSessionId: phase8CheckoutSessionId,
        gateway: "mock_online"
      })
    });
    assert.equal(phase8Attempt.response.status, 201);

    const phase8SuccessWebhook = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase8Attempt.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase8_01"
      })
    });
    assert.equal(phase8SuccessWebhook.response.status, 200);
    const phase8OrderId = phase8SuccessWebhook.json.data.order.id;

    const phase8QueueBeforeShipment = await requestJson(
      baseUrl,
      "/api/admin/shipping/queue?limit=20",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase8QueueBeforeShipment.response.status, 200);
    const phase8QueuePendingRow = phase8QueueBeforeShipment.json.data.find(
      (row) => row.orderId === phase8OrderId
    );
    assert.equal(Boolean(phase8QueuePendingRow), true);
    assert.equal(phase8QueuePendingRow.shipmentId, null);

    const phase8Courier = await requestJson(baseUrl, "/api/admin/shipping/couriers", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        courierName: "Mock Express Logistics",
        courierCode: "MOCKX",
        trackingUrlTemplate: "https://tracking.example.com/{trackingId}",
        trackingPageUrl: "https://tracking.example.com",
        supportEmail: "support@mockx.example.com",
        supportPhone: "+91-8800001122",
        apiEnabled: false,
        apiProvider: "manual_courier",
        isActive: true
      })
    });
    assert.equal(phase8Courier.response.status, 201);
    const phase8CourierId = phase8Courier.json.data.id;

    const phase8ShipmentCreate = await requestJson(baseUrl, "/api/admin/shipping/shipments", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        orderId: phase8OrderId,
        courierProfileId: phase8CourierId,
        packageCount: 1,
        adminNotes: "Packed for dispatch"
      })
    });
    assert.equal(phase8ShipmentCreate.response.status, 201);
    const phase8ShipmentId = phase8ShipmentCreate.json.data.shipment.id;

    const phase8TrackingUpdate = await requestJson(
      baseUrl,
      `/api/admin/shipping/shipments/${phase8ShipmentId}/tracking`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          courierProfileId: phase8CourierId,
          trackingId: "AWB-PHASE8-001",
          dispatchDate: "2026-05-23",
          expectedDeliveryDate: "2026-05-28"
        })
      }
    );
    assert.equal(phase8TrackingUpdate.response.status, 200);
    assert.equal(
      phase8TrackingUpdate.json.data.shipment.trackingUrl.includes(
        encodeURIComponent("AWB-PHASE8-001")
      ),
      true
    );

    const phase8SendTrackingEmail = await requestJson(
      baseUrl,
      `/api/admin/shipping/shipments/${phase8ShipmentId}/tracking-email`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          toEmail: "buyer.phase8@example.com"
        })
      }
    );
    assert.equal(phase8SendTrackingEmail.response.status, 200);
    assert.equal(phase8SendTrackingEmail.json.data.status, "sent");

    const phase8PodForm = new FormData();
    phase8PodForm.append(
      "file",
      new Blob([tinyPngBytes], { type: "image/png" }),
      "pod-proof.png"
    );

    const phase8PodResponse = await fetch(
      `${baseUrl}/api/admin/shipping/shipments/${phase8ShipmentId}/pod`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${superAdminToken}`
        },
        body: phase8PodForm
      }
    );
    const phase8PodJson = await phase8PodResponse.json();
    assert.equal(phase8PodResponse.status, 201);
    assert.equal(phase8PodJson.data.podStatus, "uploaded");
    assert.equal(Boolean(phase8PodJson.data.podFileUrl), true);

    const phase8DeliveredUpdate = await requestJson(
      baseUrl,
      `/api/admin/shipping/shipments/${phase8ShipmentId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          shipmentStatus: "delivered",
          adminNotes: "Delivered and accepted by customer."
        })
      }
    );
    assert.equal(phase8DeliveredUpdate.response.status, 200);
    assert.equal(phase8DeliveredUpdate.json.data.shipment.shipmentStatus, "delivered");
    assert.equal(phase8DeliveredUpdate.json.data.order.orderStatus, "delivered");

    const phase8DeliveredQueue = await requestJson(
      baseUrl,
      "/api/admin/shipping/queue?limit=20&shipmentStatus=delivered",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase8DeliveredQueue.response.status, 200);
    assert.equal(
      phase8DeliveredQueue.json.data.some(
        (row) => row.orderId === phase8OrderId && row.orderStatus === "delivered"
      ),
      true
    );

    const phase8PublicTracking = await requestJson(
      baseUrl,
      "/api/shipping/tracking/AWB-PHASE8-001"
    );
    assert.equal(phase8PublicTracking.response.status, 200);
    assert.equal(phase8PublicTracking.json.data.shipmentStatus, "delivered");

    const phase9GatewayList = await requestJson(baseUrl, "/api/admin/payment-gateways", {
      headers: authHeaders(superAdminToken)
    });
    assert.equal(phase9GatewayList.response.status, 200);
    assert.equal(
      phase9GatewayList.json.data.gateways.some((gateway) => gateway.code === "razorpay"),
      true
    );

    const phase9DisableRazorpay = await requestJson(
      baseUrl,
      "/api/admin/payment-gateways/razorpay",
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          isEnabled: false
        })
      }
    );
    assert.equal(phase9DisableRazorpay.response.status, 200);
    assert.equal(phase9DisableRazorpay.json.data.isEnabled, false);

    const phase9OnlineCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-online",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase9OnlineCartAdd.response.status, 201);

    const phase9OnlineCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-online",
        paymentMethod: "online",
        shippingMethod: "standard",
        billingAddress: {
          name: "Delhi Buyer Pvt Ltd",
          companyName: "Delhi Buyer Pvt Ltd",
          email: "accounts@delhibuyer.example.com",
          mobile: "+91-9811111111",
          gstin: "07AAACD1234E1Z6",
          addressLine1: "41 Industrial Area",
          city: "New Delhi",
          state: "Delhi",
          stateCode: "DL",
          pincode: "110015"
        },
        shippingAddress: {
          name: "Delhi Buyer Pvt Ltd",
          email: "accounts@delhibuyer.example.com",
          pincode: "110015",
          state: "Delhi",
          stateCode: "DL"
        }
      })
    });
    assert.equal(phase9OnlineCheckout.response.status, 200);
    const phase9CheckoutId = phase9OnlineCheckout.json.data.checkoutSession.id;

    const phase9DisabledAttempt = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-online",
        checkoutSessionId: phase9CheckoutId,
        gateway: "razorpay"
      })
    });
    assert.equal(phase9DisabledAttempt.response.status, 409);

    const phase9EnableRazorpay = await requestJson(
      baseUrl,
      "/api/admin/payment-gateways/razorpay",
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          isEnabled: true
        })
      }
    );
    assert.equal(phase9EnableRazorpay.response.status, 200);
    assert.equal(phase9EnableRazorpay.json.data.isEnabled, true);

    const phase9AttemptA = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-online",
        checkoutSessionId: phase9CheckoutId,
        gateway: "razorpay"
      })
    });
    assert.equal(phase9AttemptA.response.status, 201);

    const phase9AttemptB = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-online",
        checkoutSessionId: phase9CheckoutId,
        gateway: "razorpay"
      })
    });
    assert.equal(phase9AttemptB.response.status, 201);
    assert.notEqual(phase9AttemptA.json.data.attemptId, phase9AttemptB.json.data.attemptId);

    const phase9WebhookFirst = await requestJson(baseUrl, "/api/payments/webhook/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase9AttemptB.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase9_01",
        eventId: "evt_phase9_01"
      })
    });
    assert.equal(phase9WebhookFirst.response.status, 200);
    const phase9OrderId = phase9WebhookFirst.json.data.order.id;

    const phase9WebhookSecond = await requestJson(baseUrl, "/api/payments/webhook/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase9AttemptB.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase9_01_retry",
        eventId: "evt_phase9_02"
      })
    });
    assert.equal(phase9WebhookSecond.response.status, 200);
    assert.equal(phase9WebhookSecond.json.data.orderId, phase9OrderId);

    const phase9WebhookDuplicateEvent = await requestJson(
      baseUrl,
      "/api/payments/webhook/razorpay",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptId: phase9AttemptB.json.data.attemptId,
          status: "success",
          gatewayTxnId: "txn_phase9_01",
          eventId: "evt_phase9_01"
        })
      }
    );
    assert.equal(phase9WebhookDuplicateEvent.response.status, 200);
    assert.equal(phase9WebhookDuplicateEvent.json.data.duplicate, true);

    const phase9ManualCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-manual",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase9ManualCartAdd.response.status, 201);

    const phase9ManualCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-manual",
        paymentMethod: "direct_bank_transfer",
        shippingMethod: "standard",
        billingAddress: {
          name: "Mumbai Integrators LLP",
          companyName: "Mumbai Integrators LLP",
          email: "finance@mumbaiintegrators.example.com",
          mobile: "+91-9822222222",
          gstin: "27AAAAA1234A1Z5",
          addressLine1: "12 MIDC Road",
          city: "Mumbai",
          state: "Maharashtra",
          stateCode: "MH",
          pincode: "400001"
        },
        shippingAddress: {
          name: "Mumbai Integrators LLP",
          email: "finance@mumbaiintegrators.example.com",
          pincode: "400001",
          state: "Maharashtra",
          stateCode: "MH"
        }
      })
    });
    assert.equal(phase9ManualCheckout.response.status, 200);
    assert.equal(phase9ManualCheckout.json.data.order.paymentStatus, "pending");
    const phase9ManualOrderId = phase9ManualCheckout.json.data.order.id;

    const phase9ManualForm = new FormData();
    phase9ManualForm.append("sessionId", "phase9-manual");
    phase9ManualForm.append("orderId", phase9ManualOrderId);
    phase9ManualForm.append("paymentMethod", "direct_bank_transfer");
    phase9ManualForm.append("utrNumber", "UTR-PHASE9-001");
    phase9ManualForm.append("note", "Payment done via net banking.");
    phase9ManualForm.append(
      "file",
      new Blob([tinyPngBytes], { type: "image/png" }),
      "payment-proof.png"
    );

    const phase9ManualSubmitResponse = await fetch(
      `${baseUrl}/api/payments/manual/submit`,
      {
        method: "POST",
        body: phase9ManualForm
      }
    );
    const phase9ManualSubmitJson = await phase9ManualSubmitResponse.json();
    assert.equal(phase9ManualSubmitResponse.status, 201);
    assert.equal(phase9ManualSubmitJson.data.order.paymentStatus, "pending");
    const phase9ManualSubmissionId = phase9ManualSubmitJson.data.submission.id;

    const phase9ManualQueue = await requestJson(
      baseUrl,
      "/api/admin/manual-payments?status=pending_verification&limit=20",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase9ManualQueue.response.status, 200);
    assert.equal(
      phase9ManualQueue.json.data.some(
        (row) =>
          row.id === phase9ManualSubmissionId &&
          row.order &&
          row.order.paymentStatus === "pending"
      ),
      true
    );

    const phase9ManualVerify = await requestJson(
      baseUrl,
      `/api/admin/manual-payments/${phase9ManualSubmissionId}/verify`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          action: "approve",
          gatewayTxnId: "manual_txn_phase9_01",
          verificationNote: "Verified in bank statement."
        })
      }
    );
    assert.equal(phase9ManualVerify.response.status, 200);
    assert.equal(phase9ManualVerify.json.data.order.paymentStatus, "paid");

    const phase10InvoiceForOnlineOrder = await requestJson(
      baseUrl,
      `/api/admin/invoices/order/${phase9OrderId}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase10InvoiceForOnlineOrder.response.status, 200);
    assert.equal(phase10InvoiceForOnlineOrder.json.data.orderId, phase9OrderId);
    assert.equal(phase10InvoiceForOnlineOrder.json.data.pricing.cgstTotal > 0, true);
    assert.equal(phase10InvoiceForOnlineOrder.json.data.pricing.sgstTotal > 0, true);
    assert.equal(phase10InvoiceForOnlineOrder.json.data.pricing.igstTotal, 0);
    assert.equal(
      phase10InvoiceForOnlineOrder.json.data.display.customInvoiceFields[0].label,
      "Project Code"
    );
    const phase10OnlineInvoiceId = phase10InvoiceForOnlineOrder.json.data.id;

    const phase10InvoiceForManualOrder = await requestJson(
      baseUrl,
      `/api/admin/invoices/order/${phase9ManualOrderId}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase10InvoiceForManualOrder.response.status, 200);
    assert.equal(phase10InvoiceForManualOrder.json.data.orderId, phase9ManualOrderId);
    assert.equal(phase10InvoiceForManualOrder.json.data.pricing.cgstTotal, 0);
    assert.equal(phase10InvoiceForManualOrder.json.data.pricing.sgstTotal, 0);
    assert.equal(phase10InvoiceForManualOrder.json.data.pricing.igstTotal > 0, true);
    assert.equal(
      phase10InvoiceForManualOrder.json.data.sequenceNumber >
        phase10InvoiceForOnlineOrder.json.data.sequenceNumber,
      true
    );
    assert.notEqual(phase10InvoiceForManualOrder.json.data.pricing.roundOff, 0);
    assert.equal(
      Number(
        (
          phase10InvoiceForManualOrder.json.data.pricing.taxableValue +
          phase10InvoiceForManualOrder.json.data.pricing.gstTotal +
          phase10InvoiceForManualOrder.json.data.pricing.shippingCharge +
          phase10InvoiceForManualOrder.json.data.pricing.roundOff
        ).toFixed(2)
      ),
      Number(phase10InvoiceForManualOrder.json.data.pricing.grandTotal.toFixed(2))
    );

    const phase10InvoiceListForOrder = await requestJson(
      baseUrl,
      `/api/admin/invoices?orderId=${phase9OrderId}&limit=10`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase10InvoiceListForOrder.response.status, 200);
    assert.equal(phase10InvoiceListForOrder.json.data.length, 1);

    const phase10RegenerateInvoice = await requestJson(
      baseUrl,
      `/api/admin/invoices/order/${phase9OrderId}/generate`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({})
      }
    );
    assert.equal(phase10RegenerateInvoice.response.status, 200);
    assert.equal(phase10RegenerateInvoice.json.data.created, false);
    assert.equal(
      phase10RegenerateInvoice.json.data.invoice.id,
      phase10InvoiceForOnlineOrder.json.data.id
    );
    assert.equal(Boolean(phase10RegenerateInvoice.json.data.invoice.lockedAt), true);

    const phase10UpdateInvoiceSettingsAgain = await requestJson(
      baseUrl,
      "/api/admin/settings/invoice-settings",
      {
        method: "PUT",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          invoiceFooter: "Updated footer for future invoices only.",
          customInvoiceFields: [
            {
              label: "Project Code",
              value: "DELHI-OPS-02"
            }
          ]
        })
      }
    );
    assert.equal(phase10UpdateInvoiceSettingsAgain.response.status, 200);

    const phase10LockedInvoiceRefetch = await requestJson(
      baseUrl,
      `/api/admin/invoices/${phase10OnlineInvoiceId}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase10LockedInvoiceRefetch.response.status, 200);
    assert.equal(
      phase10LockedInvoiceRefetch.json.data.display.footer,
      "Thank you for choosing Jenix India."
    );
    assert.equal(
      phase10LockedInvoiceRefetch.json.data.display.customInvoiceFields[0].value,
      "DELHI-OPS-01"
    );

    const phase10DownloadInvoice = await requestJson(
      baseUrl,
      `/api/admin/invoices/${phase10OnlineInvoiceId}/download`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase10DownloadInvoice.response.status, 200);
    assert.equal(Boolean(phase10DownloadInvoice.json.data.fileName), true);

    const phase10TallyMonthly = await requestJson(
      baseUrl,
      "/api/admin/tally-export?period=monthly&dateFrom=2026-04-01&dateTo=2027-03-31",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase10TallyMonthly.response.status, 200);
    assert.equal(phase10TallyMonthly.json.data.rowCount >= 2, true);
    assert.equal(
      phase10TallyMonthly.json.data.csv.includes(
        phase10InvoiceForOnlineOrder.json.data.invoiceNumber
      ),
      true
    );
    assert.equal(
      phase10TallyMonthly.json.data.csv.includes(
        phase10InvoiceForManualOrder.json.data.invoiceNumber
      ),
      true
    );
    assert.equal(
      Number(phase10TallyMonthly.json.data.totals.grandTotal.toFixed(2)),
      Number(
        phase10TallyMonthly.json.data.rows
          .reduce((sum, row) => sum + Number(row.grandTotal || 0), 0)
          .toFixed(2)
      )
    );
    assert.equal(
      /^2026-\d{2}$/.test(phase10TallyMonthly.json.data.rows[0].periodKey),
      true
    );

    const phase10TallyYearly = await requestJson(
      baseUrl,
      "/api/admin/tally-export?period=yearly&dateFrom=2026-04-01&dateTo=2027-03-31",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase10TallyYearly.response.status, 200);
    assert.equal(/^\d{4}$/.test(phase10TallyYearly.json.data.rows[0].periodKey), true);
    assert.equal(phase10TallyYearly.json.data.xmlReady, false);

    const phase11AccountCustomerLogin = await requestJson(
      baseUrl,
      "/api/auth/customer/login-google",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          googleSub: "google-sub-phase11-account",
          email: "phase11.account@example.com",
          name: "Phase 11 Account User",
          mobile: "+91-9898989898"
        })
      }
    );
    assert.equal(phase11AccountCustomerLogin.response.status, 200);
    const phase11AccountCustomerToken = phase11AccountCustomerLogin.json.data.accessToken;

    const phase11CustomerCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase11CustomerCartAdd.response.status, 201);

    const phase11CustomerCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        paymentMethod: "online",
        shippingMethod: "standard",
        billingAddress: {
          name: "Phase 11 Account User",
          email: "phase11.account@example.com",
          mobile: "+91-9898989898",
          addressLine1: "B-12 Market Road",
          city: "Delhi",
          state: "Delhi",
          stateCode: "DL",
          pincode: "110001"
        },
        shippingAddress: {
          name: "Phase 11 Account User",
          email: "phase11.account@example.com",
          mobile: "+91-9898989898",
          pincode: "110001",
          state: "Delhi",
          stateCode: "DL"
        }
      })
    });
    assert.equal(phase11CustomerCheckout.response.status, 200);
    const phase11CustomerCheckoutId = phase11CustomerCheckout.json.data.checkoutSession.id;

    const phase11CustomerAttempt = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        checkoutSessionId: phase11CustomerCheckoutId,
        gateway: "mock_online"
      })
    });
    assert.equal(phase11CustomerAttempt.response.status, 201);

    const phase11CustomerWebhook = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase11CustomerAttempt.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase11_customer_01"
      })
    });
    assert.equal(phase11CustomerWebhook.response.status, 200);
    const phase11CustomerOrderId = phase11CustomerWebhook.json.data.order.id;
    const phase11CustomerInvoiceId = phase11CustomerWebhook.json.data.invoice.id;

    const phase11CustomerOrders = await requestJson(
      baseUrl,
      "/api/customer/account/orders?limit=20",
      {
        headers: authHeaders(phase11AccountCustomerToken)
      }
    );
    assert.equal(phase11CustomerOrders.response.status, 200);
    assert.equal(
      phase11CustomerOrders.json.data.some((row) => row.id === phase11CustomerOrderId),
      true
    );

    const phase11OtherCustomer = await requestJson(
      baseUrl,
      "/api/auth/customer/login-google",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          googleSub: "google-sub-phase11-other",
          email: "other.phase11@example.com",
          name: "Other Phase11 User"
        })
      }
    );
    assert.equal(phase11OtherCustomer.response.status, 200);
    const phase11OtherCustomerToken = phase11OtherCustomer.json.data.accessToken;

    const phase11OtherOrderAccess = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase11CustomerOrderId}`,
      {
        headers: authHeaders(phase11OtherCustomerToken)
      }
    );
    assert.equal(phase11OtherOrderAccess.response.status, 403);

    const phase11CustomerInvoiceDownload = await requestJson(
      baseUrl,
      `/api/customer/account/invoices/${phase11CustomerInvoiceId}/download`,
      {
        headers: authHeaders(phase11AccountCustomerToken)
      }
    );
    assert.equal(phase11CustomerInvoiceDownload.response.status, 200);
    assert.equal(Boolean(phase11CustomerInvoiceDownload.json.data.fileName), true);

    const phase11SaveProduct = await requestJson(
      baseUrl,
      `/api/customer/account/saved-products/${createdProductId}`,
      {
        method: "POST",
        headers: authHeaders(phase11AccountCustomerToken),
        body: JSON.stringify({})
      }
    );
    assert.equal(phase11SaveProduct.response.status, 201);

    const phase11CreateAddress = await requestJson(
      baseUrl,
      "/api/customer/account/addresses",
      {
        method: "POST",
        headers: authHeaders(phase11AccountCustomerToken),
        body: JSON.stringify({
          label: "Office",
          name: "Phase 11 Account User",
          mobile: "+91-9898989898",
          email: "phase11.account@example.com",
          addressLine1: "B-12 Market Road",
          city: "Delhi",
          state: "Delhi",
          stateCode: "DL",
          pincode: "110001",
          isDefaultBilling: true,
          isDefaultShipping: true
        })
      }
    );
    assert.equal(phase11CreateAddress.response.status, 201);

    const phase11UpdateGst = await requestJson(
      baseUrl,
      "/api/customer/account/gst-details",
      {
        method: "PUT",
        headers: authHeaders(phase11AccountCustomerToken),
        body: JSON.stringify({
          gstin: "07AABCU9603R1ZX",
          businessName: "Phase 11 Systems",
          contactName: "Phase 11 Account User"
        })
      }
    );
    assert.equal(phase11UpdateGst.response.status, 200);

    const phase11Bootstrap = await requestJson(
      baseUrl,
      "/api/customer/account/bootstrap?historyLimit=6",
      {
        headers: authHeaders(phase11AccountCustomerToken)
      }
    );
    assert.equal(phase11Bootstrap.response.status, 200);
    assert.equal(phase11Bootstrap.json.data.savedProducts.length > 0, true);
    assert.equal(phase11Bootstrap.json.data.savedAddresses.length > 0, true);
    assert.equal(phase11Bootstrap.json.data.gstDetails.gstin, "07AABCU9603R1ZX");

    const phase11ShipmentCreate = await requestJson(baseUrl, "/api/admin/shipping/shipments", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        orderId: phase11CustomerOrderId,
        courierProfileId: phase8CourierId,
        packageCount: 1,
        adminNotes: "Phase 11 shipment"
      })
    });
    assert.equal(phase11ShipmentCreate.response.status, 201);
    const phase11ShipmentId = phase11ShipmentCreate.json.data.shipment.id;

    const phase11TrackingUpdate = await requestJson(
      baseUrl,
      `/api/admin/shipping/shipments/${phase11ShipmentId}/tracking`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          courierProfileId: phase8CourierId,
          trackingId: "AWB-PHASE11-001",
          dispatchDate: "2026-05-24",
          expectedDeliveryDate: "2026-05-29"
        })
      }
    );
    assert.equal(phase11TrackingUpdate.response.status, 200);

    const phase11TrackingList = await requestJson(
      baseUrl,
      "/api/customer/account/tracking?limit=20",
      {
        headers: authHeaders(phase11AccountCustomerToken)
      }
    );
    assert.equal(phase11TrackingList.response.status, 200);
    assert.equal(
      phase11TrackingList.json.data.some(
        (row) => row.orderId === phase11CustomerOrderId && row.trackingId === "AWB-PHASE11-001"
      ),
      true
    );

    const phase11CustomerOrderDetail = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase11CustomerOrderId}`,
      {
        headers: authHeaders(phase11AccountCustomerToken)
      }
    );
    assert.equal(phase11CustomerOrderDetail.response.status, 200);
    assert.equal(
      phase11CustomerOrderDetail.json.data.trackingDetails.trackingId,
      "AWB-PHASE11-001"
    );

    const phase11UpdatePrice = await requestJson(
      baseUrl,
      `/api/admin/products/${createdProductId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          salePrice: 4300
        })
      }
    );
    assert.equal(phase11UpdatePrice.response.status, 200);

    const phase11Reorder = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase11CustomerOrderId}/reorder`,
      {
        method: "POST",
        headers: authHeaders(phase11AccountCustomerToken),
        body: JSON.stringify({
          mode: "replace"
        })
      }
    );
    assert.equal(phase11Reorder.response.status, 200);
    assert.equal(
      phase11Reorder.json.data.reconciliation.some(
        (row) => row.productId === createdProductId && row.priceChanged === true
      ),
      true
    );
    assert.equal(
      phase11Reorder.json.data.cart.items.find((row) => row.productId === createdProductId)
        .finalUnitPriceAfterDiscount,
      4300
    );

    const phase11GuestCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase11-guest-link",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase11GuestCartAdd.response.status, 201);

    const phase11GuestCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase11-guest-link",
        paymentMethod: "direct_bank_transfer",
        shippingMethod: "standard",
        billingAddress: {
          name: "Guest Link User",
          mobile: "+91-9444333222",
          email: "guest.link@example.com",
          addressLine1: "24 Station Road",
          city: "Pune",
          state: "Maharashtra",
          stateCode: "MH",
          pincode: "411001"
        },
        shippingAddress: {
          name: "Guest Link User",
          mobile: "+91-9444333222",
          email: "guest.link@example.com",
          pincode: "411001",
          state: "Maharashtra",
          stateCode: "MH"
        }
      })
    });
    assert.equal(phase11GuestCheckout.response.status, 200);
    const phase11GuestOrderId = phase11GuestCheckout.json.data.order.id;

    const phase11UnverifiedLinkAttempt = await requestJson(
      baseUrl,
      "/api/customer/account/orders/link-guest",
      {
        method: "POST",
        headers: authHeaders(customerToken),
        body: JSON.stringify({
          orderId: phase11GuestOrderId
        })
      }
    );
    assert.equal(phase11UnverifiedLinkAttempt.response.status, 403);

    const phase11OtpRequest = await requestJson(baseUrl, "/api/auth/customer/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9444333222"
      })
    });
    assert.equal(phase11OtpRequest.response.status, 200);

    const phase11OtpVerify = await requestJson(baseUrl, "/api/auth/customer/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9444333222",
        code: phase11OtpRequest.json.data.devCode,
        name: "Guest Link Owner"
      })
    });
    assert.equal(phase11OtpVerify.response.status, 200);
    const phase11OtpToken = phase11OtpVerify.json.data.accessToken;

    const phase11GuestOrderBeforeLink = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase11GuestOrderId}`,
      {
        headers: authHeaders(phase11OtpToken)
      }
    );
    assert.equal(phase11GuestOrderBeforeLink.response.status, 403);

    const phase11VerifiedLinkAttempt = await requestJson(
      baseUrl,
      "/api/customer/account/orders/link-guest",
      {
        method: "POST",
        headers: authHeaders(phase11OtpToken),
        body: JSON.stringify({
          orderId: phase11GuestOrderId
        })
      }
    );
    assert.equal(phase11VerifiedLinkAttempt.response.status, 200);
    assert.equal(phase11VerifiedLinkAttempt.json.data.linked, true);

    const phase11GuestOrderAfterLink = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase11GuestOrderId}`,
      {
        headers: authHeaders(phase11OtpToken)
      }
    );
    assert.equal(phase11GuestOrderAfterLink.response.status, 200);

    const phase12StockTopUp = await requestJson(
      baseUrl,
      `/api/admin/products/${createdProductId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          stockQty: 12
        })
      }
    );
    assert.equal(phase12StockTopUp.response.status, 200);

    const phase12ReminderCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase12-reminder-session",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase12ReminderCartAdd.response.status, 201);

    const phase12RecoveryListAfterAdd = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts?limit=50",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase12RecoveryListAfterAdd.response.status, 200);
    const phase12ReminderRecovery = phase12RecoveryListAfterAdd.json.data.find(
      (row) => row.ownerId === "phase12-reminder-session"
    );
    assert.equal(Boolean(phase12ReminderRecovery), true);
    assert.equal(phase12ReminderRecovery.stage, "cart_added");
    assert.equal(phase12ReminderRecovery.cartItemCount, 1);
    assert.equal(Boolean(phase12ReminderRecovery.recoveryToken), true);

    const phase12ReminderCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase12-reminder-session",
        paymentMethod: "online",
        shippingMethod: "standard",
        billingAddress: {
          name: "Phase 12 Reminder User",
          email: "phase12.reminder@example.com",
          mobile: "+91-9333300001",
          addressLine1: "4 Service Lane",
          city: "Delhi",
          state: "Delhi",
          stateCode: "DL",
          pincode: "110001"
        },
        shippingAddress: {
          name: "Phase 12 Reminder User",
          email: "phase12.reminder@example.com",
          mobile: "+91-9333300001",
          pincode: "110001",
          state: "Delhi",
          stateCode: "DL"
        }
      })
    });
    assert.equal(phase12ReminderCheckout.response.status, 200);

    const phase12ReminderAttempt = await requestJson(
      baseUrl,
      "/api/payments/create-attempt",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "phase12-reminder-session",
          checkoutSessionId: phase12ReminderCheckout.json.data.checkoutSession.id,
          gateway: "mock_online"
        })
      }
    );
    assert.equal(phase12ReminderAttempt.response.status, 201);

    const phase12ReminderFailWebhook = await requestJson(
      baseUrl,
      "/api/payments/webhook/mock",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptId: phase12ReminderAttempt.json.data.attemptId,
          status: "failed",
          gatewayTxnId: "txn_phase12_fail_01",
          failureReason: "payment_problem"
        })
      }
    );
    assert.equal(phase12ReminderFailWebhook.response.status, 200);

    const phase12RecoveryAfterFailure = await requestJson(
      baseUrl,
      `/api/admin/abandoned-carts/${phase12ReminderRecovery.id}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase12RecoveryAfterFailure.response.status, 200);
    assert.equal(phase12RecoveryAfterFailure.json.data.stage, "payment_failed");
    assert.equal(
      phase12RecoveryAfterFailure.json.data.paymentAttemptId,
      phase12ReminderAttempt.json.data.attemptId
    );
    assert.equal(phase12RecoveryAfterFailure.json.data.failureReason, "payment_problem");

    const phase12FeedbackSave = await requestJson(
      baseUrl,
      `/api/recovery/${phase12ReminderRecovery.recoveryToken}/feedback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "need GST invoice",
          note: "Need GST bill before paying."
        })
      }
    );
    assert.equal(phase12FeedbackSave.response.status, 200);
    assert.equal(phase12FeedbackSave.json.data.feedbackReason, "need GST invoice");

    const phase12FailureLastActivityAt =
      phase12RecoveryAfterFailure.json.data.lastActivityAt;
    const phase12RunReminderA = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts/reminders/run",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          nowIso: new Date(
            Date.parse(phase12FailureLastActivityAt) + 31 * 60 * 1000
          ).toISOString(),
          limit: 20
        })
      }
    );
    assert.equal(phase12RunReminderA.response.status, 200);
    assert.equal(
      phase12RunReminderA.json.data.reminders.some(
        (row) => row.recoveryId === phase12ReminderRecovery.id
      ),
      true
    );

    const phase12RunReminderB = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts/reminders/run",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          nowIso: new Date(
            Date.parse(phase12FailureLastActivityAt) + 7 * 60 * 60 * 1000
          ).toISOString(),
          limit: 20
        })
      }
    );
    assert.equal(phase12RunReminderB.response.status, 200);
    assert.equal(
      phase12RunReminderB.json.data.reminders.some(
        (row) => row.recoveryId === phase12ReminderRecovery.id
      ),
      true
    );

    const phase12RunReminderC = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts/reminders/run",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          nowIso: new Date(
            Date.parse(phase12FailureLastActivityAt) + 25 * 60 * 60 * 1000
          ).toISOString(),
          limit: 20
        })
      }
    );
    assert.equal(phase12RunReminderC.response.status, 200);
    assert.equal(
      phase12RunReminderC.json.data.reminders.some(
        (row) => row.recoveryId === phase12ReminderRecovery.id
      ),
      true
    );

    const phase12RunReminderD = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts/reminders/run",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          nowIso: new Date(
            Date.parse(phase12FailureLastActivityAt) + 49 * 60 * 60 * 1000
          ).toISOString(),
          limit: 20
        })
      }
    );
    assert.equal(phase12RunReminderD.response.status, 200);
    assert.equal(phase12RunReminderD.json.data.dispatchedCount, 0);

    const phase12RecoveryAfterReminders = await requestJson(
      baseUrl,
      `/api/admin/abandoned-carts/${phase12ReminderRecovery.id}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase12RecoveryAfterReminders.response.status, 200);
    assert.equal(phase12RecoveryAfterReminders.json.data.reminderCount, 3);
    assert.equal(phase12RecoveryAfterReminders.json.data.feedbackReason, "need GST invoice");

    const phase12RestoreSourceAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase12-restore-source",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase12RestoreSourceAdd.response.status, 201);

    const phase12RecoveryListForRestore = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts?limit=50",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase12RecoveryListForRestore.response.status, 200);
    const phase12RestoreRecovery = phase12RecoveryListForRestore.json.data.find(
      (row) => row.ownerId === "phase12-restore-source"
    );
    assert.equal(Boolean(phase12RestoreRecovery), true);

    const phase12RestoreCart = await requestJson(
      baseUrl,
      `/api/recovery/${phase12RestoreRecovery.recoveryToken}/restore`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetSessionId: "phase12-restore-target",
          mode: "replace"
        })
      }
    );
    assert.equal(phase12RestoreCart.response.status, 200);
    assert.equal(phase12RestoreCart.json.data.restored, true);

    const phase12RestoredCartView = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase12-restore-target"
    );
    assert.equal(phase12RestoredCartView.response.status, 200);
    assert.equal(
      phase12RestoredCartView.json.data.items.some(
        (row) => row.productId === createdProductId && row.qty === 1
      ),
      true
    );

    const phase12CompletedCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase12-complete-session",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase12CompletedCartAdd.response.status, 201);

    const phase12CompletedCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase12-complete-session",
        paymentMethod: "online",
        shippingMethod: "standard",
        billingAddress: {
          name: "Phase 12 Complete User",
          email: "phase12.complete@example.com",
          mobile: "+91-9333300002",
          addressLine1: "8 Complete Road",
          city: "Delhi",
          state: "Delhi",
          stateCode: "DL",
          pincode: "110001"
        },
        shippingAddress: {
          name: "Phase 12 Complete User",
          email: "phase12.complete@example.com",
          mobile: "+91-9333300002",
          pincode: "110001",
          state: "Delhi",
          stateCode: "DL"
        }
      })
    });
    assert.equal(phase12CompletedCheckout.response.status, 200);

    const phase12CompletedAttempt = await requestJson(
      baseUrl,
      "/api/payments/create-attempt",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "phase12-complete-session",
          checkoutSessionId: phase12CompletedCheckout.json.data.checkoutSession.id,
          gateway: "mock_online"
        })
      }
    );
    assert.equal(phase12CompletedAttempt.response.status, 201);

    const phase12CompletedWebhook = await requestJson(
      baseUrl,
      "/api/payments/webhook/mock",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptId: phase12CompletedAttempt.json.data.attemptId,
          status: "success",
          gatewayTxnId: "txn_phase12_complete_01"
        })
      }
    );
    assert.equal(phase12CompletedWebhook.response.status, 200);

    const phase12RecoveryListAfterComplete = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts?limit=50",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase12RecoveryListAfterComplete.response.status, 200);
    const phase12CompletedRecovery = phase12RecoveryListAfterComplete.json.data.find(
      (row) => row.ownerId === "phase12-complete-session"
    );
    assert.equal(Boolean(phase12CompletedRecovery), true);
    assert.equal(phase12CompletedRecovery.stage, "recovered");
    assert.equal(phase12CompletedRecovery.reminderCount, 0);

    const phase12RunReminderAfterComplete = await requestJson(
      baseUrl,
      "/api/admin/abandoned-carts/reminders/run",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          nowIso: new Date(
            Date.parse(phase12CompletedRecovery.lastActivityAt) + 49 * 60 * 60 * 1000
          ).toISOString(),
          limit: 20
        })
      }
    );
    assert.equal(phase12RunReminderAfterComplete.response.status, 200);
    assert.equal(
      phase12RunReminderAfterComplete.json.data.reminders.some(
        (row) => row.recoveryId === phase12CompletedRecovery.id
      ),
      false
    );

    const phase12CompletedRecoveryRefetch = await requestJson(
      baseUrl,
      `/api/admin/abandoned-carts/${phase12CompletedRecovery.id}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase12CompletedRecoveryRefetch.response.status, 200);
    assert.equal(phase12CompletedRecoveryRefetch.json.data.reminderCount, 0);

    const phase9DiscountCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase9-discount",
        productId: createdProductId,
        qty: 1
      })
    });
    assert.equal(phase9DiscountCartAdd.response.status, 201);

    const phase9CartOnline = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase9-discount&paymentMethod=online"
    );
    assert.equal(phase9CartOnline.response.status, 200);

    const phase9CartManualBank = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase9-discount&paymentMethod=direct_bank_transfer"
    );
    assert.equal(phase9CartManualBank.response.status, 200);
    assert.equal(phase9CartManualBank.json.data.pricing.discountAmount > 0, true);

    const phase9CartManualUpi = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase9-discount&paymentMethod=manual_upi"
    );
    assert.equal(phase9CartManualUpi.response.status, 200);
    assert.equal(phase9CartManualUpi.json.data.pricing.discountAmount > 0, true);

    assert.equal(phase9CartOnline.json.data.pricing.discountAmount, 0);
    assert.equal(
      phase9CartManualBank.json.data.pricing.discountAmount >
        phase9CartOnline.json.data.pricing.discountAmount,
      true
    );

    const phase9CartBackToOnline = await requestJson(
      baseUrl,
      "/api/cart?sessionId=phase9-discount&paymentMethod=online"
    );
    assert.equal(phase9CartBackToOnline.response.status, 200);
    assert.equal(phase9CartBackToOnline.json.data.pricing.discountAmount, 0);

    const archiveProduct = await requestJson(
      baseUrl,
      `/api/admin/products/${createdProductId}`,
      {
        method: "DELETE",
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(archiveProduct.response.status, 200);

    const publicProductAfterArchive = await requestJson(
      baseUrl,
      `/api/products/${createdProductSlug}`
    );
    assert.equal(publicProductAfterArchive.response.status, 404);

    const zeroResultQuery = await requestJson(
      baseUrl,
      `/api/search?q=${encodeURIComponent("zzzz-no-match-query")}&limit=5`
    );
    assert.equal(zeroResultQuery.response.status, 200);
    assert.equal(zeroResultQuery.json.data.resultCount, 0);

    const googleLogin = await requestJson(baseUrl, "/api/auth/customer/login-google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        googleSub: "google-sub-101",
        email: "google.user@example.com",
        name: "Google User"
      })
    });
    assert.equal(googleLogin.response.status, 200);
    assert.equal(googleLogin.json.data.customer.verifiedEmail, true);

    const otpRequest = await requestJson(baseUrl, "/api/auth/customer/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+919888777666"
      })
    });
    assert.equal(otpRequest.response.status, 200);
    assert.equal(Boolean(otpRequest.json.data.devCode), true);

    const otpVerify = await requestJson(baseUrl, "/api/auth/customer/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+919888777666",
        code: otpRequest.json.data.devCode,
        name: "OTP Customer"
      })
    });
    assert.equal(otpVerify.response.status, 200);
    assert.equal(otpVerify.json.data.customer.verifiedMobile, true);

    const createGroup = await requestJson(baseUrl, "/api/admin/roles-permissions", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        name: "Restricted Staff",
        description: "Can only view staff and logs",
        permissions: ["staff.view"]
      })
    });
    assert.equal(createGroup.response.status, 201);
    const restrictedGroupId = createGroup.json.data.id;

    const createStaff = await requestJson(baseUrl, "/api/admin/staff", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        name: "Restricted User",
        email: "restricted.staff@example.com",
        mobile: "+919001112223",
        password: "StaffPass@123",
        permissionGroupId: restrictedGroupId
      })
    });
    assert.equal(createStaff.response.status, 201);

    const restrictedLogin = await requestJson(baseUrl, "/api/auth/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "restricted.staff@example.com",
        password: "StaffPass@123"
      })
    });
    assert.equal(restrictedLogin.response.status, 200);
    const restrictedToken = restrictedLogin.json.data.accessToken;

    const restrictedSettingsUpdate = await requestJson(
      baseUrl,
      "/api/admin/settings/store-profile",
      {
        method: "PUT",
        headers: authHeaders(restrictedToken),
        body: JSON.stringify({
          storeName: "Should Not Save"
        })
      }
    );
    assert.equal(restrictedSettingsUpdate.response.status, 403);

    const searchOverview = await requestJson(baseUrl, "/api/admin/search/overview", {
      headers: authHeaders(superAdminToken)
    });
    assert.equal(searchOverview.response.status, 200);
    assert.equal(searchOverview.json.data.synonymsCount > 0, true);

    const searchZeroResults = await requestJson(
      baseUrl,
      "/api/admin/search/zero-results?limit=10",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(searchZeroResults.response.status, 200);
    assert.equal(
      searchZeroResults.json.data.some(
        (row) => row.normalizedQuery === "zzzz-no-match-query"
      ),
      true
    );

    const reindexSearch = await requestJson(baseUrl, "/api/admin/search/reindex", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({})
    });
    assert.equal(reindexSearch.response.status, 200);
    assert.equal(Boolean(reindexSearch.json.data.lastReindexedAt), true);

    const activityLogs = await requestJson(baseUrl, "/api/admin/activity-logs", {
      headers: authHeaders(superAdminToken)
    });
    assert.equal(activityLogs.response.status, 200);
    assert.equal(activityLogs.json.data.length > 0, true);
    assert.equal(
      activityLogs.json.data.some(
        (entry) =>
          entry.action === "staff.user.created" ||
          entry.action === "settings.section.updated"
      ),
      true
    );

    // eslint-disable-next-line no-console
    console.log("Regression checks passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Regression checks failed.", error);
  process.exit(1);
});
