const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { createApp } = require("../app");
const { resetCatalogStoreForRegression } = require("../database/catalog-store");
const { resetInvoiceStoreForRegression } = require("../database/invoice-store");
const { resetPaymentStoreForRegression } = require("../database/payment-store");
const { resetRecoveryStoreForRegression } = require("../database/recovery-store");
const { resetSearchStoreForRegression } = require("../database/search-store");
const { resetShippingStoreForRegression } = require("../database/shipping-store");
const { resetContentStoreForRegression } = require("../database/content-store");
const {
  resetMarketingStoreForRegression
} = require("../database/marketing-store");
const {
  resetWebsiteLeadsStoreForRegression
} = require("../database/website-leads-store");
const { jsonFileStore } = require("../database/json-file-store");
const { resetAuthStoreForRegression } = require("../database/auth-store");
const { resetReviewStoreForRegression } = require("../database/review-store");
const { resetPartnerStoreForRegression } = require("../database/partner-store");
const { resetPrintStoreForRegression } = require("../database/print-store");
const { ensureAuthBootstrap } = require("../modules/auth/auth.service");

const execFileAsync = promisify(execFile);

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

async function requestText(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  return { response, text };
}

async function requestBuffer(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { response, buffer };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMerchantItem(xmlText, itemId) {
  const match = String(xmlText || "").match(
    new RegExp(
      `<item>[\\s\\S]*?<g:id>${escapeRegExp(itemId)}<\\/g:id>[\\s\\S]*?<\\/item>`
    )
  );
  return match ? match[0] : "";
}

function authHeaders(accessToken) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`
  };
}

async function runNodeScript(scriptPath, args = [], options = {}) {
  return execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
}

function parseJsonOutput(stdout, label) {
  const text = String(stdout || "").trim();

  try {
    return JSON.parse(text || "{}");
  } catch (_error) {
    const jsonStart = text.lastIndexOf("\n{");
    if (jsonStart >= 0) {
      try {
        return JSON.parse(text.slice(jsonStart + 1));
      } catch (error) {
        throw new Error(`Failed to parse JSON output for ${label}: ${error.message}`);
      }
    }

    throw new Error(`Failed to parse JSON output for ${label}: invalid JSON payload.`);
  }
}

async function run() {
  await jsonFileStore.resetSettingsForRegression();
  await resetCatalogStoreForRegression();
  await resetInvoiceStoreForRegression();
  await resetPaymentStoreForRegression();
  await resetRecoveryStoreForRegression();
  await resetSearchStoreForRegression();
  await resetShippingStoreForRegression();
  await resetContentStoreForRegression();
  await resetMarketingStoreForRegression();
  await resetWebsiteLeadsStoreForRegression();
  await resetAuthStoreForRegression();
  await resetReviewStoreForRegression();
  await resetPartnerStoreForRegression();
  await resetPrintStoreForRegression();
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
    const categorySlug = createCategory.json.data.slug;

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
        brand: "Jenix",
        mpn: "JNX-CCTV-RET-01",
        hsnCode: "8525",
        basePrice: 5000,
        salePrice: 4500,
        deadWeightKg: 1.75,
        shortDescription: "Retail-ready CCTV camera with GST billing support and night vision.",
        fullDescription:
          "Retail-ready CCTV camera with GST billing support, night vision, and easy NVR integration.",
        googleShoppingTitle: "Jenix Smart CCTV Camera for Retail Security",
        googleShoppingDescription:
          "Retail CCTV camera for shops with GST invoice support, night vision, and NVR compatibility.",
        googleProductCategory: "Electronics > Video > Surveillance > Security Cameras",
        productType: "CCTV > Retail Surveillance",
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
    const createdProductSku = createProduct.json.data.sku;

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
    const inactiveRelatedSku = createInactiveRelated.json.data.sku;

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

    const createOutOfStockProduct = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Warehouse Demo Camera",
        categoryId,
        brand: "Jenix",
        hsnCode: "8525",
        basePrice: 2800,
        salePrice: 2800,
        deadWeightKg: 2.25,
        stockQty: 0,
        stockStatus: "out_of_stock",
        lowStockThreshold: 1
      })
    });
    assert.equal(createOutOfStockProduct.response.status, 201);
    const outOfStockProductId = createOutOfStockProduct.json.data.id;
    const outOfStockProductSlug = createOutOfStockProduct.json.data.slug;
    const outOfStockProductSku = createOutOfStockProduct.json.data.sku;

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

    const patchSeoDefaults = await requestJson(
      baseUrl,
      "/api/admin/settings/seo-defaults",
      {
        method: "PUT",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          canonicalDomain: "https://jenixindia.com",
          homeMetaTitle: "Jenix India Products",
          homeMetaDescription: "Industrial security and automation catalogue."
        })
      }
    );
    assert.equal(patchSeoDefaults.response.status, 200);
    assert.equal(
      patchSeoDefaults.json.data.canonicalDomain,
      "https://jenixindia.com"
    );

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

    const createPublishedBlog = await requestJson(baseUrl, "/api/admin/blogs", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "How to Choose CCTV for a Retail Store",
        excerpt:
          "Retail CCTV buying guide for blind spots, GST billing, and front-counter coverage.",
        content:
          "Retail CCTV buying guide for small stores.\n\nChoose wider-angle cameras for counters, keep NVR storage ready, and plan GST invoice requirements before purchasing.\n\nUse linked product suggestions to compare camera bundles and accessories.",
        categoryId: "blogcat_cctv-surveillance-guide",
        tags: ["cctv", "retail", "buying guide"],
        author: "Jenix India Team",
        status: "published",
        linkedProductIds: [createdProductId, relatedBId],
        linkedCategoryIds: [categoryId],
        faqItems: [
          {
            question: "Which CCTV camera is best for a small shop?",
            answer: "Pick a wide-angle camera with reliable night vision and enough storage for your operating hours."
          }
        ]
      })
    });
    assert.equal(createPublishedBlog.response.status, 201);
    const publishedBlogId = createPublishedBlog.json.data.id;
    const publishedBlogSlug = createPublishedBlog.json.data.slug;

    const createDraftBlog = await requestJson(baseUrl, "/api/admin/blogs", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Internal Draft Smart Lock Notes",
        excerpt: "Draft blog that must stay hidden from public routes.",
        content: "This draft blog should not be visible until it is published.",
        categoryId: "blogcat_smart-door-lock-guide",
        tags: ["draft", "smart lock"],
        author: "Jenix Draft Team",
        status: "draft",
        linkedProductIds: [createdProductId],
        linkedCategoryIds: [categoryId]
      })
    });
    assert.equal(createDraftBlog.response.status, 201);
    const draftBlogSlug = createDraftBlog.json.data.slug;

    const publicBlogs = await requestJson(baseUrl, "/api/blogs?limit=20");
    assert.equal(publicBlogs.response.status, 200);
    assert.equal(
      publicBlogs.json.data.some((row) => row.slug === publishedBlogSlug),
      true
    );
    assert.equal(
      publicBlogs.json.data.some((row) => row.slug === draftBlogSlug),
      false
    );

    const publicBlogDetail = await requestJson(
      baseUrl,
      `/api/blogs/${publishedBlogSlug}`
    );
    assert.equal(publicBlogDetail.response.status, 200);
    assert.equal(publicBlogDetail.json.data.relatedProducts.length > 0, true);
    assert.equal(publicBlogDetail.json.data.article.slug, publishedBlogSlug);
    assert.equal(
      publicBlogDetail.json.data.structuredData.article["@type"],
      "Article"
    );
    assert.equal(
      publicBlogDetail.json.data.structuredData.faq["@type"],
      "FAQPage"
    );

    const publicDraftBlogDetail = await requestJson(
      baseUrl,
      `/api/blogs/${draftBlogSlug}`
    );
    assert.equal(publicDraftBlogDetail.response.status, 404);

    const blogSearch = await requestJson(
      baseUrl,
      `/api/search?q=${encodeURIComponent("retail cctv buying guide")}&limit=10`
    );
    assert.equal(blogSearch.response.status, 200);
    assert.equal(
      blogSearch.json.data.results.some(
        (row) => row.entityType === "blog" && row.id === publishedBlogId
      ),
      true
    );

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
    assert.equal(
      customerProductPage.json.data.recommendations.guides.some(
        (row) => row.slug === publishedBlogSlug
      ),
      true
    );
    assert.equal(customerProductPage.json.data.seo.metaTitle, "Jenix Smart CCTV Camera for Retail Security");
    assert.equal(
      customerProductPage.json.data.seo.canonicalUrl,
      `https://jenixindia.com/products/${createdProductSlug}`
    );
    assert.equal(
      customerProductPage.json.data.structuredData.product["@type"],
      "Product"
    );
    assert.equal(
      customerProductPage.json.data.structuredData.offer["@type"],
      "Offer"
    );
    assert.equal(
      customerProductPage.json.data.structuredData.breadcrumb["@type"],
      "BreadcrumbList"
    );
    assert.equal(
      customerProductPage.json.data.structuredData.product.offers["@id"],
      `https://jenixindia.com/products/${createdProductSlug}#offer`
    );
    assert.equal(
      customerProductPage.json.data.structuredData.offer.price,
      "4500.00"
    );
    assert.equal(
      customerProductPage.json.data.structuredData.offer.hasMerchantReturnPolicy
        .returnPolicyCategory,
      "https://schema.org/MerchantReturnNotPermitted"
    );

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
    assert.equal(
      productRecommendations.json.data.guides.some((row) => row.slug === publishedBlogSlug),
      true
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

    const merchantFeed = await requestText(baseUrl, "/google-merchant-feed.xml");
    assert.equal(merchantFeed.response.status, 200);
    const primaryMerchantItem = extractMerchantItem(merchantFeed.text, createdProductSku);
    assert.equal(Boolean(primaryMerchantItem), true);
    assert.equal(
      primaryMerchantItem.includes(
        "<title>Jenix Smart CCTV Camera for Retail Security</title>"
      ),
      true
    );
    assert.equal(
      primaryMerchantItem.includes("<g:price>5000.00 INR</g:price>"),
      true
    );
    assert.equal(
      primaryMerchantItem.includes("<g:sale_price>4500.00 INR</g:sale_price>"),
      true
    );
    assert.equal(
      primaryMerchantItem.includes("<g:shipping_weight>1.75 kg</g:shipping_weight>"),
      true
    );
    assert.equal(
      primaryMerchantItem.includes("<g:availability>in stock</g:availability>"),
      true
    );
    assert.equal(
      merchantFeed.text.includes(`<g:id>${inactiveRelatedSku}</g:id>`),
      false
    );
    const outOfStockMerchantItem = extractMerchantItem(
      merchantFeed.text,
      outOfStockProductSku
    );
    assert.equal(
      outOfStockMerchantItem.includes("<g:availability>out of stock</g:availability>"),
      true
    );

    const facebookFeed = await requestText(baseUrl, "/facebook-product-feed.xml");
    assert.equal(facebookFeed.response.status, 200);
    const primaryFacebookItem = extractMerchantItem(
      facebookFeed.text,
      createdProductSku
    );
    assert.equal(Boolean(primaryFacebookItem), true);
    assert.equal(
      primaryFacebookItem.includes(
        `<link>https://jenixindia.com/products/${createdProductSlug}</link>`
      ),
      true
    );
    assert.equal(
      facebookFeed.text.includes(`<g:id>${inactiveRelatedSku}</g:id>`),
      false
    );

    const sitemap = await requestText(baseUrl, "/sitemap.xml");
    assert.equal(sitemap.response.status, 200);
    assert.equal(sitemap.text.includes("/sitemaps/products.xml"), true);
    assert.equal(sitemap.text.includes("/sitemaps/categories.xml"), true);
    assert.equal(sitemap.text.includes("/sitemaps/blogs.xml"), true);

    const productSitemap = await requestText(baseUrl, "/sitemaps/products.xml");
    assert.equal(productSitemap.response.status, 200);
    assert.equal(
      productSitemap.text.includes(`https://jenixindia.com/products/${createdProductSlug}`),
      true
    );

    const categorySitemap = await requestText(baseUrl, "/sitemaps/categories.xml");
    assert.equal(categorySitemap.response.status, 200);
    assert.equal(
      categorySitemap.text.includes(`https://jenixindia.com/categories/${categorySlug}`),
      true
    );

    const blogSitemap = await requestText(baseUrl, "/sitemaps/blogs.xml");
    assert.equal(blogSitemap.response.status, 200);
    assert.equal(
      blogSitemap.text.includes(`https://jenixindia.com/guides/${publishedBlogSlug}`),
      true
    );

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
    assert.equal(
      shippingEstimate.json.data.options.some(
        (option) => Number(option.shippingCharge || 0) > 0
      ),
      true
    );

    const createWebsiteLead = await requestJson(baseUrl, "/api/website-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Amit Singh",
        mobile: "+919900001111",
        email: "amit.lead@example.com",
        businessName: "Amit Security Solutions",
        businessType: "Security Integrator",
        city: "Delhi",
        currentWebsite: "https://amit-security.example.com",
        monthlyOrders: 180,
        productCount: 350,
        message: "Need the same type of webapp for our catalogue and dealer workflow.",
        sourcePage: `/guides/${publishedBlogSlug}`
      })
    });
    assert.equal(createWebsiteLead.response.status, 201);
    assert.equal(createWebsiteLead.json.data.status, "new");
    const createdWebsiteLeadId = createWebsiteLead.json.data.id;

    const adminWebsiteLeads = await requestJson(
      baseUrl,
      "/api/admin/website-leads?limit=20",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(adminWebsiteLeads.response.status, 200);
    const createdWebsiteLead = adminWebsiteLeads.json.data.find(
      (row) => row.id === createdWebsiteLeadId
    );
    assert.equal(Boolean(createdWebsiteLead), true);
    assert.equal(createdWebsiteLead.sourcePage, `/guides/${publishedBlogSlug}`);

    const updateWebsiteLeadStatus = await requestJson(
      baseUrl,
      `/api/admin/website-leads/${createdWebsiteLeadId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          status: "demo_scheduled",
          notes: "Qualified lead. Demo booked for next Tuesday."
        })
      }
    );
    assert.equal(updateWebsiteLeadStatus.response.status, 200);
    assert.equal(updateWebsiteLeadStatus.json.data.status, "demo_scheduled");
    assert.equal(
      updateWebsiteLeadStatus.json.data.notes,
      "Qualified lead. Demo booked for next Tuesday."
    );

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

    // Security regression guard: /customer/login-google was an unauthenticated
    // account-takeover route (trusted client-supplied googleSub/email with zero
    // verification against Google). Removed — must never come back.
    const phase11InsecureGoogleLoginGone = await requestJson(
      baseUrl,
      "/api/auth/customer/login-google",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          googleSub: "google-sub-phase11-account",
          email: "phase11.account@example.com",
          name: "Phase 11 Account User"
        })
      }
    );
    assert.equal(phase11InsecureGoogleLoginGone.response.status, 404);

    const phase11AccountOtpRequest = await requestJson(baseUrl, "/api/auth/customer/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9898989898"
      })
    });
    assert.equal(phase11AccountOtpRequest.response.status, 200);

    const phase11AccountCustomerLogin = await requestJson(baseUrl, "/api/auth/customer/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9898989898",
        code: phase11AccountOtpRequest.json.data.devCode,
        name: "Phase 11 Account User"
      })
    });
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

    const phase11OtherOtpRequest = await requestJson(baseUrl, "/api/auth/customer/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9898989899"
      })
    });
    assert.equal(phase11OtherOtpRequest.response.status, 200);

    const phase11OtherCustomer = await requestJson(baseUrl, "/api/auth/customer/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9898989899",
        code: phase11OtherOtpRequest.json.data.devCode,
        name: "Other Phase11 User"
      })
    });
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
      5074 // salePrice 4300 with 18% GST included (finalUnitPriceAfterDiscount is GST-inclusive)
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
    const phase12ReminderARow = phase12RunReminderA.json.data.reminders.find(
      (row) => row.recoveryId === phase12ReminderRecovery.id
    );
    assert.equal(Boolean(phase12ReminderARow), true);
    // Proves the reminder actually attempted a real send through the branded
    // order_left_in_cart template (not just recorded a preview string like
    // before) — any defined status means the notification pipeline ran
    // end-to-end without throwing, regardless of whether SMTP is configured
    // in this environment.
    assert.equal(
      ["sent", "simulated_sent", "failed", "skipped_no_recipient", "template_inactive"].includes(
        phase12ReminderARow.sendStatus
      ),
      true
    );

    // Regression guard: buildTemplateVariables() in marketing.service.js
    // used to be a separate, manually-maintained field list that silently
    // dropped recoveryUrl/whatsappLink/whatsappNumber/itemsTable/
    // customerEmail/customerMobile/rejectionReason -- every one of those
    // was declared in TEMPLATE_VARIABLES (marketing.model.js) but missing
    // from buildTemplateVariables' own hardcoded object, so the abandoned-
    // cart email's "Continue My Order" button rendered href="" in
    // production for months. Confirms the actual recovery link (not an
    // empty string) lands in the rendered email body, not just that a
    // template exists and "sent".
    const phase12ReminderLogs = await requestJson(
      baseUrl,
      "/api/admin/marketing/notification-logs?templateKey=order_left_in_cart&limit=50",
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase12ReminderLogs.response.status, 200);
    const phase12ReminderLog = phase12ReminderLogs.json.data.find(
      (row) => row.relatedResourceId === phase12ReminderRecovery.id
    );
    assert.equal(Boolean(phase12ReminderLog), true);
    assert.equal(phase12ReminderLog.variables.recoveryUrl.includes("/recover/"), true);
    // The specific "Continue My Order" button must carry the real URL, not
    // an empty href -- checked directly against the template's href
    // attribute rather than a blanket "no href=\"\" anywhere" scan, since
    // the WhatsApp box's href is legitimately empty in this test (no
    // WhatsApp number configured in the ephemeral test settings).
    assert.equal(
      phase12ReminderLog.body.includes(`href="${phase12ReminderLog.variables.recoveryUrl}"`),
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

    const phase17TemplateUpdate = await requestJson(
      baseUrl,
      "/api/admin/marketing/email-templates/order_placed",
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          subject: "Order {{orderNo}} confirmed",
          body: "Hello {{customerName}}, invoice {{invoiceNo}} is ready."
        })
      }
    );
    assert.equal(phase17TemplateUpdate.response.status, 200);
    assert.equal(
      phase17TemplateUpdate.json.data.subject,
      "Order {{orderNo}} confirmed"
    );

    const phase17TemplatePreview = await requestJson(
      baseUrl,
      "/api/admin/marketing/email-templates/order_placed/preview",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          variables: {
            customerName: "Preview Buyer",
            orderNo: "JNX-ORD-PREVIEW",
            invoiceNo: "INV-PREVIEW"
          }
        })
      }
    );
    assert.equal(phase17TemplatePreview.response.status, 200);
    assert.equal(
      phase17TemplatePreview.json.data.subject,
      "Order JNX-ORD-PREVIEW confirmed"
    );
    assert.equal(
      phase17TemplatePreview.json.data.body.includes("Preview Buyer"),
      true
    );

    const phase17OfferCreate = await requestJson(
      baseUrl,
      "/api/admin/marketing/offers",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          name: "May Dealer Push",
          type: "amount_based",
          amountOff: 250,
          minOrderValue: 1000,
          customerType: "retail",
          productIds: [createdProductId],
          startsAt: "2026-05-01T00:00:00.000Z",
          endsAt: "2026-05-31T23:59:59.000Z",
          isActive: true
        })
      }
    );
    assert.equal(phase17OfferCreate.response.status, 201);

    const phase17NotifySubscriptionCreate = await requestJson(
      baseUrl,
      "/api/marketing/notify-when-available",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: outOfStockProductId,
          customerName: "Waitlist Buyer",
          email: "waitlist@example.com",
          sourcePage: `/products/${outOfStockProductSlug}`
        })
      }
    );
    assert.equal(phase17NotifySubscriptionCreate.response.status, 201);
    assert.equal(
      phase17NotifySubscriptionCreate.json.data.productIsAvailable,
      false
    );

    const phase17Overview = await requestJson(
      baseUrl,
      "/api/admin/marketing/overview",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase17Overview.response.status, 200);
    assert.equal(
      phase17Overview.json.data.customerSegments.totalCustomers >= 1,
      true
    );
    assert.equal(
      phase17Overview.json.data.notifyWhenAvailable.pendingCount >= 1,
      true
    );
    assert.equal(
      String(
        phase17Overview.json.data.feeds.facebookProductFeedUrl || ""
      ).includes("/facebook-product-feed.xml"),
      true
    );

    const phase17NotifySubscriptions = await requestJson(
      baseUrl,
      "/api/admin/marketing/notify-subscriptions?limit=50",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase17NotifySubscriptions.response.status, 200);
    const phase17NotifySubscription = phase17NotifySubscriptions.json.data.find(
      (row) => row.email === "waitlist@example.com"
    );
    assert.equal(Boolean(phase17NotifySubscription), true);
    assert.equal(phase17NotifySubscription.productIsAvailable, false);

    const phase17RestockProduct = await requestJson(
      baseUrl,
      `/api/admin/inventory/products/${outOfStockProductId}/adjust`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          deltaQty: 3,
          reason: "phase17_restock"
        })
      }
    );
    assert.equal(phase17RestockProduct.response.status, 200);
    assert.equal(
      phase17RestockProduct.json.data.inventory.stockStatus !== "out_of_stock",
      true
    );

    const phase17SendNotify = await requestJson(
      baseUrl,
      `/api/admin/marketing/notify-subscriptions/${phase17NotifySubscription.id}/send`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({})
      }
    );
    assert.equal(phase17SendNotify.response.status, 200);
    assert.equal(
      phase17SendNotify.json.data.subscription.status,
      "notified"
    );

    const phase17Logs = await requestJson(
      baseUrl,
      "/api/admin/marketing/notification-logs?limit=200",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase17Logs.response.status, 200);
    assert.equal(
      phase17Logs.json.data.some((row) => row.templateKey === "order_placed"),
      true
    );
    // Same buildTemplateVariables regression guard as Phase 12 above, but
    // for the order-confirmation email specifically: {{itemsTable}} was
    // silently rendering blank in production, meaning every "Order Placed"
    // email since the field was introduced showed the order number/total
    // but never the actual products purchased.
    const phase17OrderPlacedLog = phase17Logs.json.data.find((row) => row.templateKey === "order_placed");
    assert.equal(phase17OrderPlacedLog.variables.itemsTable.includes("<tr"), true);
    assert.equal(phase17OrderPlacedLog.body.includes("<tr"), true);
    assert.equal(
      phase17Logs.json.data.some((row) => row.templateKey === "payment_failed"),
      true
    );
    assert.equal(
      phase17Logs.json.data.some(
        (row) =>
          row.templateKey === "tracking_detail_update" &&
          row.relatedResourceId === phase8ShipmentId
      ),
      true
    );
    assert.equal(
      phase17Logs.json.data.some(
        (row) =>
          row.templateKey === "notify_when_available" &&
          row.relatedResourceId === outOfStockProductId
      ),
      true
    );

    const phase18DealerRegister = await requestJson(
      baseUrl,
      "/api/auth/customer/register-email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Phase 18 Dealer",
          email: "phase18.dealer@example.com",
          password: "Phase18Dealer@123"
        })
      }
    );
    assert.equal(phase18DealerRegister.response.status, 201);
    const phase18DealerToken = phase18DealerRegister.json.data.accessToken;
    const phase18DealerCustomerId = phase18DealerRegister.json.data.customer.id;

    const phase18SpecialRegister = await requestJson(
      baseUrl,
      "/api/auth/customer/register-email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Phase 18 Special Dealer",
          email: "phase18.special@example.com",
          password: "Phase18Special@123"
        })
      }
    );
    assert.equal(phase18SpecialRegister.response.status, 201);
    const phase18SpecialToken = phase18SpecialRegister.json.data.accessToken;
    const phase18SpecialCustomerId = phase18SpecialRegister.json.data.customer.id;

    const phase18B2BProductCreate = await requestJson(
      baseUrl,
      "/api/admin/products",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          title: "Phase 18 Dealer Camera Kit",
          categoryId,
          hsnCode: "8525",
          basePrice: 6200,
          salePrice: 5800,
          moq: 2,
          stockQty: 40,
          lowStockThreshold: 4,
          shortDescription: "Dealer workflow regression product.",
          priceGroupPrices: [
            {
              priceGroup: "dealer",
              unitPrice: 5100
            }
          ],
          customerSpecificPrices: [
            {
              customerId: phase18SpecialCustomerId,
              unitPrice: 4700
            }
          ]
        })
      }
    );
    assert.equal(phase18B2BProductCreate.response.status, 201);
    const phase18B2BProductId = phase18B2BProductCreate.json.data.id;
    const phase18B2BProductSlug = phase18B2BProductCreate.json.data.slug;

    const phase18DealerCustomerPatch = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase18DealerCustomerId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          customerType: "dealer",
          priceGroup: "dealer",
          isB2BApproved: true,
          gstin: "08ABCDE1234F1Z5",
          companyName: "Phase 18 Dealer LLP",
          creditAllowed: false,
          bankTransferOnly: true,
          pickupAllowed: true,
          orderMode: "offline_request"
        })
      }
    );
    assert.equal(phase18DealerCustomerPatch.response.status, 200);
    assert.equal(phase18DealerCustomerPatch.json.data.isB2BApproved, true);

    const phase18SpecialCustomerPatch = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase18SpecialCustomerId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          customerType: "dealer",
          priceGroup: "dealer",
          isB2BApproved: true,
          gstin: "24ABCDE1234F1Z5",
          companyName: "Phase 18 Special Projects",
          creditAllowed: false,
          bankTransferOnly: true,
          pickupAllowed: false,
          orderMode: "offline_request"
        })
      }
    );
    assert.equal(phase18SpecialCustomerPatch.response.status, 200);
    assert.equal(phase18SpecialCustomerPatch.json.data.isB2BApproved, true);

    const phase18GuestProduct = await requestJson(
      baseUrl,
      `/api/products/${phase18B2BProductSlug}`
    );
    assert.equal(phase18GuestProduct.response.status, 200);
    assert.equal(phase18GuestProduct.json.data.pricing.visiblePrice, 5800);
    assert.equal(phase18GuestProduct.json.data.pricing.isB2BPrice, false);

    const phase18DealerProduct = await requestJson(
      baseUrl,
      `/api/products/${phase18B2BProductSlug}`,
      {
        headers: authHeaders(phase18DealerToken)
      }
    );
    assert.equal(phase18DealerProduct.response.status, 200);
    assert.equal(phase18DealerProduct.json.data.pricing.visiblePrice, 5100);
    assert.equal(phase18DealerProduct.json.data.pricing.priceSource, "price_group");
    assert.equal(phase18DealerProduct.json.data.pricing.usesOrderRequestFlow, true);

    const phase18SpecialProduct = await requestJson(
      baseUrl,
      `/api/products/${phase18B2BProductSlug}`,
      {
        headers: authHeaders(phase18SpecialToken)
      }
    );
    assert.equal(phase18SpecialProduct.response.status, 200);
    assert.equal(phase18SpecialProduct.json.data.pricing.visiblePrice, 4700);
    assert.equal(
      phase18SpecialProduct.json.data.pricing.priceSource,
      "customer_specific"
    );

    const phase18DealerSearch = await requestJson(
      baseUrl,
      `/api/search?q=${encodeURIComponent("Phase 18 Dealer Camera Kit")}&limit=5`,
      {
        headers: authHeaders(phase18DealerToken)
      }
    );
    assert.equal(phase18DealerSearch.response.status, 200);
    const phase18DealerSearchMatch = phase18DealerSearch.json.data.results.find(
      (row) => row.id === phase18B2BProductId
    );
    assert.equal(Boolean(phase18DealerSearchMatch), true);
    assert.equal(phase18DealerSearchMatch.product.pricing.visiblePrice, 5100);

    const phase18DealerCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase18DealerToken),
      body: JSON.stringify({
        productId: phase18B2BProductId,
        qty: 2
      })
    });
    assert.equal(phase18DealerCartAdd.response.status, 201);

    const phase18DealerCart = await requestJson(
      baseUrl,
      "/api/cart?paymentMethod=direct_bank_transfer&shippingMethod=self_pickup",
      {
        headers: authHeaders(phase18DealerToken)
      }
    );
    assert.equal(phase18DealerCart.response.status, 200);
    const phase18DealerCartLine = phase18DealerCart.json.data.items.find(
      (row) => row.productId === phase18B2BProductId
    );
    assert.equal(Boolean(phase18DealerCartLine), true);
    assert.equal(phase18DealerCartLine.priceSource, "price_group");
    assert.equal(phase18DealerCartLine.compareAtUnitPrice, 5800);
    assert.equal(phase18DealerCartLine.finalUnitPriceAfterDiscount, 5897.64); // 5100 * 0.98 direct-bank discount, then 18% GST included

    const phase18DealerOnlineBlocked = await requestJson(
      baseUrl,
      "/api/checkout/start",
      {
        method: "POST",
        headers: authHeaders(phase18DealerToken),
        body: JSON.stringify({
          paymentMethod: "online",
          shippingMethod: "self_pickup",
          billingAddress: {
            name: "Phase 18 Dealer",
            companyName: "Phase 18 Dealer LLP",
            email: "phase18.dealer@example.com",
            mobile: "+91-9811111111",
            gstin: "08ABCDE1234F1Z5",
            addressLine1: "Warehouse 12",
            city: "Jaipur",
            state: "Rajasthan",
            stateCode: "RJ",
            pincode: "302001"
          },
          shippingAddress: {
            name: "Phase 18 Dealer",
            companyName: "Phase 18 Dealer LLP",
            email: "phase18.dealer@example.com",
            mobile: "+91-9811111111",
            gstin: "08ABCDE1234F1Z5",
            addressLine1: "Warehouse 12",
            city: "Jaipur",
            state: "Rajasthan",
            stateCode: "RJ",
            pincode: "302001"
          }
        })
      }
    );
    assert.equal(phase18DealerOnlineBlocked.response.status, 409);

    const phase18DealerManualUpiBlocked = await requestJson(
      baseUrl,
      "/api/checkout/start",
      {
        method: "POST",
        headers: authHeaders(phase18DealerToken),
        body: JSON.stringify({
          paymentMethod: "manual_upi",
          shippingMethod: "self_pickup",
          billingAddress: {
            name: "Phase 18 Dealer",
            companyName: "Phase 18 Dealer LLP",
            email: "phase18.dealer@example.com",
            mobile: "+91-9811111111",
            gstin: "08ABCDE1234F1Z5",
            addressLine1: "Warehouse 12",
            city: "Jaipur",
            state: "Rajasthan",
            stateCode: "RJ",
            pincode: "302001"
          },
          shippingAddress: {
            name: "Phase 18 Dealer",
            companyName: "Phase 18 Dealer LLP",
            email: "phase18.dealer@example.com",
            mobile: "+91-9811111111",
            gstin: "08ABCDE1234F1Z5",
            addressLine1: "Warehouse 12",
            city: "Jaipur",
            state: "Rajasthan",
            stateCode: "RJ",
            pincode: "302001"
          }
        })
      }
    );
    assert.equal(phase18DealerManualUpiBlocked.response.status, 409);

    const phase18DealerCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: authHeaders(phase18DealerToken),
      body: JSON.stringify({
        paymentMethod: "direct_bank_transfer",
        shippingMethod: "self_pickup",
        billingAddress: {
          name: "Phase 18 Dealer",
          companyName: "Phase 18 Dealer LLP",
          email: "phase18.dealer@example.com",
          mobile: "+91-9811111111",
          gstin: "08ABCDE1234F1Z5",
          addressLine1: "Warehouse 12",
          city: "Jaipur",
          state: "Rajasthan",
          stateCode: "RJ",
          pincode: "302001"
        },
        shippingAddress: {
          name: "Phase 18 Dealer",
          companyName: "Phase 18 Dealer LLP",
          email: "phase18.dealer@example.com",
          mobile: "+91-9811111111",
          gstin: "08ABCDE1234F1Z5",
          addressLine1: "Warehouse 12",
          city: "Jaipur",
          state: "Rajasthan",
          stateCode: "RJ",
          pincode: "302001"
        }
      })
    });
    assert.equal(phase18DealerCheckout.response.status, 200);
    assert.equal(
      phase18DealerCheckout.json.data.order.orderStatus,
      "awaiting_admin_approval"
    );
    const phase18DealerOrderId = phase18DealerCheckout.json.data.order.id;

    const phase18DealerEarlyPaymentForm = new FormData();
    phase18DealerEarlyPaymentForm.append("orderId", phase18DealerOrderId);
    phase18DealerEarlyPaymentForm.append("paymentMethod", "direct_bank_transfer");
    phase18DealerEarlyPaymentForm.append("utrNumber", "UTR-PHASE18-EARLY");
    phase18DealerEarlyPaymentForm.append("note", "Attempted before admin approval.");
    phase18DealerEarlyPaymentForm.append(
      "file",
      new Blob([tinyPngBytes], { type: "image/png" }),
      "phase18-early-proof.png"
    );

    const phase18DealerEarlyPaymentResponse = await fetch(
      `${baseUrl}/api/payments/manual/submit`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${phase18DealerToken}`
        },
        body: phase18DealerEarlyPaymentForm
      }
    );
    const phase18DealerEarlyPaymentJson =
      await phase18DealerEarlyPaymentResponse.json();
    assert.equal(phase18DealerEarlyPaymentResponse.status, 409);
    assert.equal(
      phase18DealerEarlyPaymentJson.message.includes("after admin approval"),
      true
    );

    const phase18OrderRequests = await requestJson(
      baseUrl,
      "/api/admin/customers/order-requests/list?status=awaiting_admin_approval&limit=50",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase18OrderRequests.response.status, 200);
    assert.equal(
      phase18OrderRequests.json.data.some((row) => row.id === phase18DealerOrderId),
      true
    );

    const phase18DealerApprove = await requestJson(
      baseUrl,
      `/api/admin/customers/order-requests/${phase18DealerOrderId}/approve`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          paymentMethod: "direct_bank_transfer",
          approvalNote: "Approved for offline bank transfer."
        })
      }
    );
    assert.equal(phase18DealerApprove.response.status, 200);
    assert.equal(
      phase18DealerApprove.json.data.orderStatus,
      "awaiting_bank_payment"
    );

    const phase18DealerOrderAwaitingPayment = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase18DealerOrderId}`,
      {
        headers: authHeaders(phase18DealerToken)
      }
    );
    assert.equal(phase18DealerOrderAwaitingPayment.response.status, 200);
    assert.equal(
      phase18DealerOrderAwaitingPayment.json.data.orderStatus,
      "awaiting_bank_payment"
    );
    assert.equal(
      Object.keys(
        phase18DealerOrderAwaitingPayment.json.data.manualPaymentInstructions
          ?.instructions || {}
      ).length > 0,
      true
    );

    const phase18DealerPaymentForm = new FormData();
    phase18DealerPaymentForm.append("orderId", phase18DealerOrderId);
    phase18DealerPaymentForm.append("paymentMethod", "direct_bank_transfer");
    phase18DealerPaymentForm.append("utrNumber", "UTR-PHASE18-DEALER-001");
    phase18DealerPaymentForm.append("note", "Dealer payment submitted.");
    phase18DealerPaymentForm.append(
      "file",
      new Blob([tinyPngBytes], { type: "image/png" }),
      "phase18-dealer-proof.png"
    );

    const phase18DealerPaymentResponse = await fetch(
      `${baseUrl}/api/payments/manual/submit`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${phase18DealerToken}`
        },
        body: phase18DealerPaymentForm
      }
    );
    const phase18DealerPaymentJson = await phase18DealerPaymentResponse.json();
    assert.equal(phase18DealerPaymentResponse.status, 201);
    assert.equal(
      phase18DealerPaymentJson.data.order.manualPaymentStatus,
      "submitted"
    );
    const phase18DealerSubmissionId = phase18DealerPaymentJson.data.submission.id;

    const phase18DealerManualQueue = await requestJson(
      baseUrl,
      "/api/admin/manual-payments?status=pending_verification&limit=50",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase18DealerManualQueue.response.status, 200);
    assert.equal(
      phase18DealerManualQueue.json.data.some(
        (row) => row.id === phase18DealerSubmissionId
      ),
      true
    );

    const phase18DealerVerifyPayment = await requestJson(
      baseUrl,
      `/api/admin/manual-payments/${phase18DealerSubmissionId}/verify`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          action: "approve",
          gatewayTxnId: "phase18_dealer_bank_txn",
          verificationNote: "Dealer transfer verified."
        })
      }
    );
    assert.equal(phase18DealerVerifyPayment.response.status, 200);
    assert.equal(phase18DealerVerifyPayment.json.data.order.paymentStatus, "paid");
    assert.equal(
      phase18DealerVerifyPayment.json.data.order.orderStatus,
      "payment_received"
    );
    assert.equal(Boolean(phase18DealerVerifyPayment.json.data.invoice?.id), true);

    const phase18DealerReadyForPickup = await requestJson(
      baseUrl,
      `/api/admin/customers/order-requests/${phase18DealerOrderId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          orderStatus: "ready_for_pickup",
          adminNote: "Pickup window starts at 4 PM."
        })
      }
    );
    assert.equal(phase18DealerReadyForPickup.response.status, 200);
    assert.equal(
      phase18DealerReadyForPickup.json.data.shipmentStatus,
      "ready_for_pickup"
    );

    const phase18DealerPickedUp = await requestJson(
      baseUrl,
      `/api/admin/customers/order-requests/${phase18DealerOrderId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          orderStatus: "picked_up",
          adminNote: "Collected by warehouse representative."
        })
      }
    );
    assert.equal(phase18DealerPickedUp.response.status, 200);
    assert.equal(phase18DealerPickedUp.json.data.orderStatus, "picked_up");
    assert.equal(phase18DealerPickedUp.json.data.shipmentStatus, "picked_up");

    const phase18DealerFinalDetail = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase18DealerOrderId}`,
      {
        headers: authHeaders(phase18DealerToken)
      }
    );
    assert.equal(phase18DealerFinalDetail.response.status, 200);
    assert.equal(
      phase18DealerFinalDetail.json.data.items[0].unitPriceUsed,
      phase18DealerCartLine.finalUnitPriceAfterDiscount
    );
    assert.equal(phase18DealerFinalDetail.json.data.orderStatus, "picked_up");
    assert.equal(
      phase18DealerFinalDetail.json.data.shipmentTimeline.some(
        (row) => row.code === "picked_up"
      ),
      true
    );

    const phase18SpecialCartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase18SpecialToken),
      body: JSON.stringify({
        productId: phase18B2BProductId,
        qty: 2
      })
    });
    assert.equal(phase18SpecialCartAdd.response.status, 201);

    const phase18SpecialCart = await requestJson(
      baseUrl,
      "/api/cart?paymentMethod=direct_bank_transfer&shippingMethod=standard",
      {
        headers: authHeaders(phase18SpecialToken)
      }
    );
    assert.equal(phase18SpecialCart.response.status, 200);
    const phase18SpecialCartLine = phase18SpecialCart.json.data.items.find(
      (row) => row.productId === phase18B2BProductId
    );
    assert.equal(Boolean(phase18SpecialCartLine), true);
    assert.equal(phase18SpecialCartLine.priceSource, "customer_specific");
    assert.equal(phase18SpecialCartLine.compareAtUnitPrice, 5800);
    assert.equal(phase18SpecialCartLine.finalUnitPriceAfterDiscount, 5435.08); // 4700 * 0.98 direct-bank discount, then 18% GST included

    const phase18SpecialCheckout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: authHeaders(phase18SpecialToken),
      body: JSON.stringify({
        paymentMethod: "direct_bank_transfer",
        shippingMethod: "standard",
        billingAddress: {
          name: "Phase 18 Special Dealer",
          companyName: "Phase 18 Special Projects",
          email: "phase18.special@example.com",
          mobile: "+91-9822222222",
          gstin: "24ABCDE1234F1Z5",
          addressLine1: "Plot 88 Industrial Road",
          city: "Ahmedabad",
          state: "Gujarat",
          stateCode: "GJ",
          pincode: "380001"
        },
        shippingAddress: {
          name: "Phase 18 Special Dealer",
          companyName: "Phase 18 Special Projects",
          email: "phase18.special@example.com",
          mobile: "+91-9822222222",
          gstin: "24ABCDE1234F1Z5",
          addressLine1: "Plot 88 Industrial Road",
          city: "Ahmedabad",
          state: "Gujarat",
          stateCode: "GJ",
          pincode: "380001"
        }
      })
    });
    assert.equal(phase18SpecialCheckout.response.status, 200);
    assert.equal(
      phase18SpecialCheckout.json.data.order.orderStatus,
      "awaiting_admin_approval"
    );
    const phase18SpecialOrderId = phase18SpecialCheckout.json.data.order.id;

    const phase18SpecialApprove = await requestJson(
      baseUrl,
      `/api/admin/customers/order-requests/${phase18SpecialOrderId}/approve`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          paymentMethod: "direct_bank_transfer",
          approvalNote: "Approved for dispatch workflow."
        })
      }
    );
    assert.equal(phase18SpecialApprove.response.status, 200);
    assert.equal(
      phase18SpecialApprove.json.data.orderStatus,
      "awaiting_bank_payment"
    );

    const phase18SpecialPaymentForm = new FormData();
    phase18SpecialPaymentForm.append("orderId", phase18SpecialOrderId);
    phase18SpecialPaymentForm.append("paymentMethod", "direct_bank_transfer");
    phase18SpecialPaymentForm.append("utrNumber", "UTR-PHASE18-SPECIAL-001");
    phase18SpecialPaymentForm.append("note", "Project payment submitted.");
    phase18SpecialPaymentForm.append(
      "file",
      new Blob([tinyPngBytes], { type: "image/png" }),
      "phase18-special-proof.png"
    );

    const phase18SpecialPaymentResponse = await fetch(
      `${baseUrl}/api/payments/manual/submit`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${phase18SpecialToken}`
        },
        body: phase18SpecialPaymentForm
      }
    );
    const phase18SpecialPaymentJson = await phase18SpecialPaymentResponse.json();
    assert.equal(phase18SpecialPaymentResponse.status, 201);
    const phase18SpecialSubmissionId = phase18SpecialPaymentJson.data.submission.id;

    const phase18SpecialVerify = await requestJson(
      baseUrl,
      `/api/admin/manual-payments/${phase18SpecialSubmissionId}/verify`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          action: "approve",
          gatewayTxnId: "phase18_special_bank_txn",
          verificationNote: "Special dealer transfer verified."
        })
      }
    );
    assert.equal(phase18SpecialVerify.response.status, 200);
    assert.equal(
      phase18SpecialVerify.json.data.order.orderStatus,
      "payment_received"
    );

    const phase18SpecialDispatched = await requestJson(
      baseUrl,
      `/api/admin/customers/order-requests/${phase18SpecialOrderId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          orderStatus: "dispatched",
          adminNote: "Sent via approved transport."
        })
      }
    );
    assert.equal(phase18SpecialDispatched.response.status, 200);
    assert.equal(phase18SpecialDispatched.json.data.shipmentStatus, "shipped");

    const phase18SpecialDelivered = await requestJson(
      baseUrl,
      `/api/admin/customers/order-requests/${phase18SpecialOrderId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          orderStatus: "delivered",
          adminNote: "Delivered at site."
        })
      }
    );
    assert.equal(phase18SpecialDelivered.response.status, 200);
    assert.equal(phase18SpecialDelivered.json.data.shipmentStatus, "delivered");

    const phase18SpecialFinalDetail = await requestJson(
      baseUrl,
      `/api/customer/account/orders/${phase18SpecialOrderId}`,
      {
        headers: authHeaders(phase18SpecialToken)
      }
    );
    assert.equal(phase18SpecialFinalDetail.response.status, 200);
    assert.equal(
      phase18SpecialFinalDetail.json.data.items[0].unitPriceUsed,
      phase18SpecialCartLine.finalUnitPriceAfterDiscount
    );
    assert.equal(phase18SpecialFinalDetail.json.data.orderStatus, "delivered");
    assert.equal(phase18SpecialFinalDetail.json.data.shipmentStatus, "delivered");
    assert.equal(
      phase18SpecialFinalDetail.json.data.shipmentTimeline.some(
        (row) => row.code === "delivered"
      ),
      true
    );

    const phase19ProductSearch = await requestJson(
      baseUrl,
      `/api/admin/walkin-orders/products?q=${encodeURIComponent(createdProductSku)}&categoryId=${categoryId}&limit=10`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase19ProductSearch.response.status, 200);
    const phase19ProductMatch = phase19ProductSearch.json.data.find(
      (row) => row.id === createdProductId
    );
    assert.equal(Boolean(phase19ProductMatch), true);
    assert.equal(phase19ProductMatch.gstRate, 18);

    const phase19CreateCustomerOrder = await requestJson(
      baseUrl,
      "/api/admin/walkin-orders",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          customer: {
            name: "Phase 19 Walk-in Customer",
            email: "phase19.walkin@example.com",
            mobile: "+919811223344",
            companyName: "Phase 19 Counter Sale",
            gstin: "07ABCDE1234F1Z5",
            addressLine1: "Counter Desk 1",
            city: "New Delhi",
            state: "Delhi",
            stateCode: "DL",
            pincode: "110018",
            country: "India",
            customerType: "retail"
          },
          items: [
            {
              productId: createdProductId,
              qty: 2,
              priceMode: "retail"
            }
          ],
          shippingMethod: "self_pickup",
          paymentMethod: "cash",
          markAsPaid: true,
          generateInvoice: true,
          paymentReference: "PHASE19-CASH-001",
          orderNote: "Phase 19 counter cash order."
        })
      }
    );
    assert.equal(phase19CreateCustomerOrder.response.status, 201);
    assert.equal(Boolean(phase19CreateCustomerOrder.json.data.customer.id), true);
    assert.equal(phase19CreateCustomerOrder.json.data.order.paymentMethod, "cash");
    assert.equal(phase19CreateCustomerOrder.json.data.order.paymentStatus, "paid");
    assert.equal(Boolean(phase19CreateCustomerOrder.json.data.invoice?.id), true);
    assert.equal(phase19CreateCustomerOrder.json.data.order.gstTotal > 0, true);
    assert.equal(
      phase19CreateCustomerOrder.json.data.invoice.items[0].gstRate,
      18
    );
    assert.equal(
      phase19CreateCustomerOrder.json.data.invoice.pricing.gstTotal,
      phase19CreateCustomerOrder.json.data.order.gstTotal
    );

    const phase19ExistingCustomerSearch = await requestJson(
      baseUrl,
      `/api/admin/walkin-orders/customers?q=${encodeURIComponent("Ravi Customer")}&limit=10`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase19ExistingCustomerSearch.response.status, 200);
    assert.equal(
      phase19ExistingCustomerSearch.json.data.some(
        (row) => row.id === customerRegister.json.data.customer.id
      ),
      true
    );

    const phase19PendingOrder = await requestJson(
      baseUrl,
      "/api/admin/walkin-orders",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          customerId: customerRegister.json.data.customer.id,
          customer: {
            name: "Ravi Customer",
            email: "ravi@example.com",
            mobile: "+919800000222",
            companyName: "Ravi Retail Projects",
            gstin: "06ABCDE1234F1Z5",
            addressLine1: "Shop 11, Sector 14",
            city: "Gurugram",
            state: "Haryana",
            stateCode: "HR",
            pincode: "122001",
            country: "India",
            customerType: "retail"
          },
          items: [
            {
              productId: createdProductId,
              qty: 1,
              priceMode: "retail"
            }
          ],
          shippingMethod: "standard",
          shippingCharge: 150,
          paymentMethod: "manual_upi",
          markAsPaid: false,
          generateInvoice: true,
          orderNote: "Phase 19 pending manual UPI order."
        })
      }
    );
    assert.equal(phase19PendingOrder.response.status, 201);
    assert.equal(phase19PendingOrder.json.data.order.paymentStatus, "pending");
    assert.equal(phase19PendingOrder.json.data.order.paymentMethod, "manual_upi");
    assert.equal(phase19PendingOrder.json.data.order.orderStatus, "payment_pending");
    const phase19PendingOrderId = phase19PendingOrder.json.data.order.id;

    // Unpaid orders no longer block invoice generation — they get a Proforma
    // Invoice (separate numbering series) instead of the real Tax Invoice.
    const phase19ProformaBeforePayment = await requestJson(
      baseUrl,
      `/api/admin/walkin-orders/${phase19PendingOrderId}/generate-invoice`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({})
      }
    );
    assert.equal(phase19ProformaBeforePayment.response.status, 200);
    assert.equal(
      phase19ProformaBeforePayment.json.data.invoice.documentType,
      "proforma_invoice"
    );
    assert.equal(
      phase19ProformaBeforePayment.json.data.invoice.invoiceNumber.startsWith(
        "PROFORMA-"
      ),
      true
    );
    const phase19ProformaInvoiceId = phase19ProformaBeforePayment.json.data.invoice.id;

    const phase19PaymentConfirm = await requestJson(
      baseUrl,
      `/api/admin/walkin-orders/${phase19PendingOrderId}/confirm-payment`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          paymentReference: "UPI-PHASE19-001",
          generateInvoice: true
        })
      }
    );
    assert.equal(phase19PaymentConfirm.response.status, 200);
    assert.equal(phase19PaymentConfirm.json.data.order.paymentStatus, "paid");
    assert.equal(
      phase19PaymentConfirm.json.data.order.orderStatus,
      "invoice_generated"
    );
    assert.equal(Boolean(phase19PaymentConfirm.json.data.invoice?.id), true);
    // Paying supersedes the Proforma with a real Tax Invoice — a different
    // document, not the same proforma record just relabeled.
    assert.equal(
      phase19PaymentConfirm.json.data.invoice.documentType,
      "tax_invoice"
    );
    assert.notEqual(
      phase19PaymentConfirm.json.data.invoice.id,
      phase19ProformaInvoiceId
    );

    const phase19DispatchedOrder = await requestJson(
      baseUrl,
      `/api/admin/walkin-orders/${phase19PendingOrderId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          orderStatus: "dispatched",
          adminNote: "Phase 19 manual dispatch."
        })
      }
    );
    assert.equal(phase19DispatchedOrder.response.status, 200);
    assert.equal(phase19DispatchedOrder.json.data.order.orderStatus, "dispatched");
    assert.equal(
      phase19DispatchedOrder.json.data.order.shipmentStatus,
      "shipped"
    );

    const phase19FilteredOrders = await requestJson(
      baseUrl,
      "/api/admin/walkin-orders?status=dispatched&paymentMethod=manual_upi&limit=20",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase19FilteredOrders.response.status, 200);
    assert.equal(
      phase19FilteredOrders.json.data.rows.some(
        (row) => row.id === phase19PendingOrderId
      ),
      true
    );

    const phase19AdminOrdersList = await requestJson(
      baseUrl,
      "/api/admin/orders?limit=200",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase19AdminOrdersList.response.status, 200);
    assert.equal(
      phase19AdminOrdersList.json.data.rows.some(
        (row) => row.id === phase11CustomerOrderId && row.channel === "storefront"
      ),
      true
    );
    assert.equal(
      phase19AdminOrdersList.json.data.rows.some(
        (row) => row.id === phase18SpecialOrderId && row.channel === "b2b_request"
      ),
      true
    );
    assert.equal(
      phase19AdminOrdersList.json.data.rows.some(
        (row) => row.id === phase19PendingOrderId && row.channel === "walk_in"
      ),
      true
    );

    const phase19AdminOrdersFiltered = await requestJson(
      baseUrl,
      "/api/admin/orders?channel=walk_in&paymentMethod=manual_upi&invoiceStatus=generated&limit=20",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase19AdminOrdersFiltered.response.status, 200);
    assert.equal(
      phase19AdminOrdersFiltered.json.data.rows.some(
        (row) => row.id === phase19PendingOrderId
      ),
      true
    );

    const phase19AdminOrderDetail = await requestJson(
      baseUrl,
      `/api/admin/orders/${phase19PendingOrderId}`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase19AdminOrderDetail.response.status, 200);
    assert.equal(phase19AdminOrderDetail.json.data.channel, "walk_in");
    assert.equal(
      phase19AdminOrderDetail.json.data.invoice.invoiceNumber.length > 0,
      true
    );
    assert.equal(phase19AdminOrderDetail.json.data.items.length, 1);

    const phase19EditorGroup = await requestJson(
      baseUrl,
      "/api/admin/roles-permissions",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          name: "Walk-in Editor",
          description: "Can edit walk-in orders but cannot cancel them.",
          permissions: ["orders.view", "orders.edit"]
        })
      }
    );
    assert.equal(phase19EditorGroup.response.status, 201);
    const phase19EditorGroupId = phase19EditorGroup.json.data.id;

    const phase19EditorStaff = await requestJson(baseUrl, "/api/admin/staff", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        name: "Walk-in Editor User",
        email: "walkin.editor@example.com",
        mobile: "+919000000222",
        password: "WalkinEditor@123",
        permissionGroupId: phase19EditorGroupId
      })
    });
    assert.equal(phase19EditorStaff.response.status, 201);

    const phase19EditorLogin = await requestJson(baseUrl, "/api/auth/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "walkin.editor@example.com",
        password: "WalkinEditor@123"
      })
    });
    assert.equal(phase19EditorLogin.response.status, 200);
    const phase19EditorToken = phase19EditorLogin.json.data.accessToken;

    const phase19CancelDenied = await requestJson(
      baseUrl,
      `/api/admin/walkin-orders/${phase19PendingOrderId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(phase19EditorToken),
        body: JSON.stringify({
          orderStatus: "cancelled",
          adminNote: "This should be denied without cancel permission."
        })
      }
    );
    assert.equal(phase19CancelDenied.response.status, 403);

    // ── Phase 20: admin edit-items on a not-yet-paid storefront order ──────────
    // Regression target for the item-swap bug this feature was built to avoid:
    // stock must be deducted for the NEW product at payment-verification time,
    // never the old one, and only manual/offline unpaid orders may be edited.

    const phase20ProductX = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Phase 20 Swap Source Camera",
        categoryId,
        brand: "Jenix",
        mpn: "JNX-P20-X",
        hsnCode: "8525",
        basePrice: 3000,
        salePrice: 2800,
        deadWeightKg: 1,
        shortDescription: "Phase 20 test product X.",
        fullDescription: "Phase 20 test product X.",
        stockQty: 10,
        lowStockThreshold: 2
      })
    });
    assert.equal(phase20ProductX.response.status, 201);
    const phase20ProductXId = phase20ProductX.json.data.id;

    const phase20ProductY = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Phase 20 Swap Target Camera",
        categoryId,
        brand: "Jenix",
        mpn: "JNX-P20-Y",
        hsnCode: "8525",
        basePrice: 4000,
        salePrice: 3600,
        deadWeightKg: 1,
        shortDescription: "Phase 20 test product Y.",
        fullDescription: "Phase 20 test product Y.",
        stockQty: 10,
        lowStockThreshold: 2
      })
    });
    assert.equal(phase20ProductY.response.status, 201);
    const phase20ProductYId = phase20ProductY.json.data.id;

    await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase20-swap",
        productId: phase20ProductXId,
        qty: 1
      })
    });

    const phase20Checkout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "phase20-swap",
        paymentMethod: "manual_upi",
        shippingMethod: "standard",
        billingAddress: {
          name: "Phase20 Buyer",
          email: "phase20.buyer@example.com",
          mobile: "+919000000333",
          addressLine1: "1 Test Lane",
          city: "Gurugram",
          state: "Haryana",
          stateCode: "06",
          pincode: "122001"
        },
        shippingAddress: {
          name: "Phase20 Buyer",
          email: "phase20.buyer@example.com",
          pincode: "122001",
          state: "Haryana",
          stateCode: "06"
        }
      })
    });
    assert.equal(phase20Checkout.response.status, 200);
    assert.equal(phase20Checkout.json.data.order.paymentStatus, "pending");
    const phase20OrderId = phase20Checkout.json.data.order.id;

    // Editing an online-payment-method order must be rejected (webhook race risk).
    const phase20OnlineEditDenied = await requestJson(
      baseUrl,
      `/api/admin/orders/${phase9OrderId}/items`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ items: [{ productId: phase20ProductYId, qty: 1 }] })
      }
    );
    assert.equal(phase20OnlineEditDenied.response.status, 409);

    // A staff account with only orders.view + orders.edit (no walkin-orders
    // permissions) can still use this endpoint — proves the permission wiring,
    // not just the super_admin bypass.
    const phase20Edit = await requestJson(
      baseUrl,
      `/api/admin/orders/${phase20OrderId}/items`,
      {
        method: "PATCH",
        headers: authHeaders(phase19EditorToken),
        body: JSON.stringify({
          items: [{ productId: phase20ProductYId, qty: 2 }],
          discountAmount: 50
        })
      }
    );
    assert.equal(phase20Edit.response.status, 200);
    assert.equal(phase20Edit.json.data.items.length, 1);
    assert.equal(phase20Edit.json.data.items[0].productId, phase20ProductYId);
    assert.equal(phase20Edit.json.data.items[0].qty, 2);

    const phase20ManualForm = new FormData();
    phase20ManualForm.append("sessionId", "phase20-swap");
    phase20ManualForm.append("orderId", phase20OrderId);
    phase20ManualForm.append("paymentMethod", "manual_upi");
    phase20ManualForm.append("utrNumber", "UTR-PHASE20-001");
    phase20ManualForm.append("note", "Phase 20 swapped-item payment.");
    phase20ManualForm.append(
      "file",
      new Blob([tinyPngBytes], { type: "image/png" }),
      "payment-proof.png"
    );
    const phase20ManualSubmitResponse = await fetch(
      `${baseUrl}/api/payments/manual/submit`,
      { method: "POST", body: phase20ManualForm }
    );
    const phase20ManualSubmitJson = await phase20ManualSubmitResponse.json();
    assert.equal(phase20ManualSubmitResponse.status, 201);
    const phase20SubmissionId = phase20ManualSubmitJson.data.submission.id;

    const phase20Verify = await requestJson(
      baseUrl,
      `/api/admin/manual-payments/${phase20SubmissionId}/verify`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          action: "approve",
          gatewayTxnId: "phase20_bank_txn",
          verificationNote: "Phase 20 verified."
        })
      }
    );
    assert.equal(phase20Verify.response.status, 200);
    assert.equal(phase20Verify.json.data.order.paymentStatus, "paid");

    // The bug this feature is designed to avoid: stock must be deducted from
    // the NEW product (Y, qty 2) and the OLD product (X) must be untouched.
    const phase20ProductXAfter = await requestJson(
      baseUrl,
      `/api/admin/products/${phase20ProductXId}`,
      { headers: authHeaders(superAdminToken) }
    );
    const phase20ProductYAfter = await requestJson(
      baseUrl,
      `/api/admin/products/${phase20ProductYId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase20ProductXAfter.json.data.stockQty, 10);
    assert.equal(phase20ProductYAfter.json.data.stockQty, 8);

    // Once paid (and therefore invoiced), items can no longer be edited.
    const phase20PostPaidEditDenied = await requestJson(
      baseUrl,
      `/api/admin/orders/${phase20OrderId}/items`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ items: [{ productId: phase20ProductXId, qty: 1 }] })
      }
    );
    assert.equal(phase20PostPaidEditDenied.response.status, 409);

    const phase16SalesMonth = String(
      phase10InvoiceForOnlineOrder.json.data.invoiceDate || ""
    ).slice(0, 7);
    const phase16SalesYear = String(
      phase10InvoiceForOnlineOrder.json.data.invoiceDate || ""
    ).slice(0, 4);
    assert.equal(phase16SalesMonth.length, 7);
    assert.equal(phase16SalesYear.length, 4);

    const phase16SalesReport = await requestJson(
      baseUrl,
      `/api/admin/reports/sales?period=monthly&month=${phase16SalesMonth}&limit=200`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase16SalesReport.response.status, 200);
    assert.equal(phase16SalesReport.json.data.rowCount >= 4, true);
    const phase16SalesOrderRow = phase16SalesReport.json.data.rows.find(
      (row) => row.orderNo === phase10InvoiceForOnlineOrder.json.data.orderNo
    );
    assert.equal(Boolean(phase16SalesOrderRow), true);
    assert.equal(
      phase16SalesOrderRow.invoiceNo,
      phase10InvoiceForOnlineOrder.json.data.invoiceNumber
    );
    assert.equal(
      phase16SalesOrderRow.grandTotal,
      phase10InvoiceForOnlineOrder.json.data.pricing.grandTotal
    );

    const phase16SalesCsv = await requestText(
      baseUrl,
      `/api/admin/reports/sales/export?period=monthly&month=${phase16SalesMonth}&format=csv`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase16SalesCsv.response.status, 200);
    assert.equal(
      String(phase16SalesCsv.response.headers.get("content-disposition") || "").includes(
        `sales-${phase16SalesMonth}.csv`
      ),
      true
    );
    assert.equal(
      phase16SalesCsv.text.includes(phase10InvoiceForOnlineOrder.json.data.invoiceNumber),
      true
    );

    const phase16CityPincodeReport = await requestJson(
      baseUrl,
      `/api/admin/reports/sales?period=monthly&month=${phase16SalesMonth}&city=New%20Delhi&pincode=110015&limit=50`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase16CityPincodeReport.response.status, 200);
    assert.equal(phase16CityPincodeReport.json.data.rows.length, 1);
    assert.equal(
      phase16CityPincodeReport.json.data.rows[0].orderNo,
      phase10InvoiceForOnlineOrder.json.data.orderNo
    );

    const phase16InvoiceExcel = await requestText(
      baseUrl,
      `/api/admin/reports/invoices/export?period=yearly&year=${phase16SalesYear}&format=excel`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase16InvoiceExcel.response.status, 200);
    assert.equal(
      String(phase16InvoiceExcel.response.headers.get("content-disposition") || "").includes(
        `invoices-${phase16SalesYear}.xls`
      ),
      true
    );
    assert.equal(
      phase16InvoiceExcel.text.includes(phase10InvoiceForOnlineOrder.json.data.invoiceNumber),
      true
    );

    const phase16InvoiceZip = await requestBuffer(
      baseUrl,
      `/api/admin/reports/invoices/export?period=yearly&year=${phase16SalesYear}&city=New%20Delhi&pincode=110015&format=invoice-zip`,
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase16InvoiceZip.response.status, 200);
    assert.equal(
      String(phase16InvoiceZip.response.headers.get("content-disposition") || "").includes(
        `invoices-${phase16SalesYear}.zip`
      ),
      true
    );
    assert.equal(phase16InvoiceZip.buffer.subarray(0, 2).toString("utf-8"), "PK");
    const phase16InvoiceZipText = phase16InvoiceZip.buffer.toString("utf-8");
    assert.equal(
      phase16InvoiceZipText.includes(
        `${String(
          phase10InvoiceForOnlineOrder.json.data.invoiceNumber
        ).replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`
      ),
      true
    );
    assert.equal(
      phase16InvoiceZipText.includes(
        `${String(
          phase10InvoiceForManualOrder.json.data.invoiceNumber
        ).replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`
      ),
      false
    );

    const phase16OfferReport = await requestJson(
      baseUrl,
      "/api/admin/reports/marketing-offers?period=monthly&month=2026-05&limit=50",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase16OfferReport.response.status, 200);
    assert.equal(phase16OfferReport.json.data.rowCount >= 1, true);

    const phase16OpsStaffCreate = await requestJson(baseUrl, "/api/admin/staff", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        name: "Ops Viewer",
        email: "ops.viewer@example.com",
        mobile: "+919000000111",
        password: "OpsViewer@123",
        permissionGroupId: "group_ops_staff"
      })
    });
    assert.equal(phase16OpsStaffCreate.response.status, 201);

    const phase16OpsLogin = await requestJson(baseUrl, "/api/auth/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "ops.viewer@example.com",
        password: "OpsViewer@123"
      })
    });
    assert.equal(phase16OpsLogin.response.status, 200);
    const phase16OpsToken = phase16OpsLogin.json.data.accessToken;

    const phase16OpsViewReport = await requestJson(
      baseUrl,
      `/api/admin/reports/sales?period=monthly&month=${phase16SalesMonth}&limit=20`,
      {
        headers: authHeaders(phase16OpsToken)
      }
    );
    assert.equal(phase16OpsViewReport.response.status, 200);

    const phase16OpsExportDenied = await requestText(
      baseUrl,
      `/api/admin/reports/sales/export?period=monthly&month=${phase16SalesMonth}&format=csv`,
      {
        headers: authHeaders(phase16OpsToken)
      }
    );
    assert.equal(phase16OpsExportDenied.response.status, 403);

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

    // Google login itself requires a real authorization-code exchange with Google's
    // servers (see /customer/google-exchange), which this offline suite can't
    // simulate. Email OTP verification is the closest same-guarantee substitute for
    // exercising "an externally-verified login sets verifiedEmail = true".
    const emailOtpRequestForLogin = await requestJson(baseUrl, "/api/auth/customer/email-otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "google.user@example.com" })
    });
    assert.equal(emailOtpRequestForLogin.response.status, 200);

    const googleLogin = await requestJson(baseUrl, "/api/auth/customer/email-otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "google.user@example.com",
        code: emailOtpRequestForLogin.json.data.devCode,
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

    const phase20PublicBootstrap = await requestJson(
      baseUrl,
      "/api/setup-wizard/bootstrap"
    );
    assert.equal(phase20PublicBootstrap.response.status, 200);
    assert.equal(phase20PublicBootstrap.json.data.overview.steps.length, 16);
    assert.equal(
      phase20PublicBootstrap.json.data.wizard.currentStep,
      "business_profile"
    );

    const phase20AdminWizard = await requestJson(
      baseUrl,
      "/api/admin/setup-wizard",
      {
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase20AdminWizard.response.status, 200);
    assert.equal(
      Boolean(phase20AdminWizard.json.data.overview.firstPendingStepKey),
      true
    );

    const phase20CompleteBlocked = await requestJson(
      baseUrl,
      "/api/admin/setup-wizard/complete",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({})
      }
    );
    assert.equal(phase20CompleteBlocked.response.status, 409);

    async function savePhase20Step(stepKey, payload) {
      const result = await requestJson(
        baseUrl,
        `/api/admin/setup-wizard/steps/${stepKey}`,
        {
          method: "PUT",
          headers: authHeaders(superAdminToken),
          body: JSON.stringify(payload)
        }
      );
      assert.equal(result.response.status, 200);
      return result;
    }

    const phase20BusinessProfile = await savePhase20Step("business_profile", {
      storeName: "Jenix India Pvt Ltd",
      legalBusinessName: "Jenix India Private Limited",
      supportEmail: "support@jenixindia.com",
      supportMobile: "+919999000111",
      whatsappNumber: "+919999000112",
      address: "27 Industrial Market, New Delhi",
      pickupAddress: "Warehouse 12, Kirti Nagar, New Delhi",
      state: "Delhi",
      stateCode: "07",
      storefrontDomain: "https://shop.jenixindia.com",
      adminDomain: "https://admin.jenixindia.com",
      apiDomain: "https://api.jenixindia.com"
    });
    assert.equal(
      phase20BusinessProfile.json.data.forms.business_profile.storefrontDomain,
      "https://shop.jenixindia.com"
    );

    await savePhase20Step("logo_theme", {
      themeColor: "#b91c1c",
      buttonColor: "#111827"
    });
    await savePhase20Step("gst_profile", {
      gstin: "07AABCJ1234D1Z5",
      state: "Delhi",
      stateCode: "07"
    });
    await savePhase20Step("invoice_settings", {
      invoicePrefix: "JNX",
      invoicePostfix: "26",
      invoiceStartingNumber: 125,
      invoiceNumberPadding: 6,
      invoiceFooter: "Authorised by Jenix India.",
      invoiceTerms: "Goods once sold will not be taken back without approval.",
      showBankDetails: true,
      showHsnSummary: true,
      showShippingLine: true,
      showDiscountLine: true
    });
    await savePhase20Step("admin_user", {
      name: "Super Admin",
      email: "admin@jenixindia.com",
      mobile: "+919000001000",
      password: "",
      confirmPassword: ""
    });
    await savePhase20Step("smtp_email", {
      host: "smtp.example.com",
      port: 587,
      secure: true,
      username: "smtp-user",
      fromName: "Jenix India",
      fromEmail: "noreply@jenixindia.com",
      replyToEmail: "support@jenixindia.com",
      password: "smtp-secret"
    });
    await savePhase20Step("google_login", {
      enabled: false,
      clientId: "",
      redirectUri: "",
      clientSecret: ""
    });
    await savePhase20Step("phone_otp", {
      enabled: false,
      provider: "dev",
      senderId: "",
      templateId: "",
      apiBaseUrl: "",
      authToken: ""
    });
    await savePhase20Step("payment_gateway", {
      providerCode: "razorpay",
      isEnabled: false,
      mode: "test",
      keyId: "",
      keySecret: "",
      webhookSecret: ""
    });
    await savePhase20Step("manual_bank_upi", {
      beneficiaryName: "Jenix India Pvt Ltd",
      bankName: "ICICI Bank",
      accountHolderName: "Jenix India Pvt Ltd",
      accountNumber: "1234567890",
      ifsc: "ICIC0001234",
      upiId: "payments@jenixindia",
      instructions: "Share UTR screenshot after payment for manual verification."
    });
    const phase20ShippingCourier = await savePhase20Step("shipping_courier", {
      courierName: "Blue Dart Manual",
      courierCode: "BLUEDART-MANUAL",
      trackingUrlTemplate: "https://tracking.example.com/{{trackingId}}",
      trackingPageUrl: "https://tracking.example.com",
      supportPhone: "+911140000000",
      supportEmail: "dispatch@jenixindia.com",
      apiEnabled: false,
      apiProvider: "manual_courier",
      pickupAddress: "Warehouse 12, Kirti Nagar, New Delhi",
      pickupPincode: "110015"
    });
    assert.equal(
      phase20ShippingCourier.json.data.forms.shipping_courier.courierCode,
      "BLUEDART-MANUAL"
    );
    await savePhase20Step("merchant_center", {
      merchantId: "merchant-jenix-01",
      claimedDomain: "https://shop.jenixindia.com",
      feedUrl: "https://api.jenixindia.com/google-merchant-feed.xml",
      targetCountry: "IN",
      language: "en"
    });
    await savePhase20Step("seo_search_console", {
      canonicalDomain: "https://shop.jenixindia.com",
      searchConsoleVerification: "google-site-verification=phase20",
      bingVerification: "msvalidate.01=phase20",
      googleAnalyticsId: "G-PHASE20",
      googleTagManagerId: "GTM-PHASE20"
    });
    await savePhase20Step("meta_pixel", {
      enabled: false,
      pixelId: "",
      catalogId: ""
    });
    await savePhase20Step("backup_settings", {
      backupDir: "backups/production",
      retentionDays: 21,
      cronExpression: "0 2 * * *",
      includeUploads: true,
      includeEnvFile: true,
      runHealthCheckAfterBackup: true,
      notifyEmail: "ops@jenixindia.com"
    });
    const phase20LaunchChecklist = await savePhase20Step("launch_checklist", {
      dnsReady: true,
      sslReady: true,
      frontServed: true,
      adminServed: true,
      apiServed: true,
      backupVerified: true,
      paymentGatewayReviewed: true,
      merchantFeedReviewed: true,
      searchConsoleSubmitted: true,
      firstInvoiceTested: true
    });
    assert.equal(
      phase20LaunchChecklist.json.data.overview.firstPendingStepKey,
      null
    );

    const phase20Complete = await requestJson(
      baseUrl,
      "/api/admin/setup-wizard/complete",
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({})
      }
    );
    assert.equal(phase20Complete.response.status, 200);
    assert.equal(phase20Complete.json.data.overview.completionPercent, 100);
    assert.equal(Boolean(phase20Complete.json.data.wizard.completedAt), true);

    const phase20PublicBootstrapAfterComplete = await requestJson(
      baseUrl,
      "/api/setup-wizard/bootstrap"
    );
    assert.equal(phase20PublicBootstrapAfterComplete.response.status, 200);
    assert.equal(
      phase20PublicBootstrapAfterComplete.json.data.readiness.isCompleted,
      true
    );

    const phase20TempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "jenix-phase20-")
    );

    try {
      const generateEnvScript = path.resolve(process.cwd(), "scripts/generate-env.js");
      const backupRunnerScript = path.resolve(process.cwd(), "scripts/backup-runner.js");
      const restoreRunnerScript = path.resolve(process.cwd(), "scripts/restore-runner.js");
      const seedAdminScript = path.resolve(process.cwd(), "scripts/seed-admin.js");
      const healthCheckScript = path.resolve(process.cwd(), "scripts/health-check.js");
      const renderNginxScript = path.resolve(
        process.cwd(),
        "scripts/render-nginx-config.js"
      );

      const envRoot = path.join(phase20TempRoot, "env-root");
      await fs.mkdir(envRoot, { recursive: true });
      const phase20EnvResult = await runNodeScript(
        generateEnvScript,
        [
          "--output",
          path.join(envRoot, "backend.env"),
          "--front-output",
          path.join(envRoot, "front.env"),
          "--admin-output",
          path.join(envRoot, "admin.env"),
          "--api-domain",
          "http://127.0.0.1:5500",
          "--store-domain",
          "https://shop.phase20.example.com",
          "--admin-domain",
          "https://admin.phase20.example.com",
          "--super-admin-email",
          "phase20@example.com",
          "--super-admin-password",
          "Phase20@123",
          "--port",
          "5500"
        ]
      );
      const phase20EnvSummary = parseJsonOutput(
        phase20EnvResult.stdout,
        "generate-env"
      );
      assert.equal(phase20EnvSummary.publicBaseUrl, "http://127.0.0.1:5500");
      const phase20EnvText = await fs.readFile(
        path.join(envRoot, "backend.env"),
        "utf-8"
      );
      assert.equal(
        phase20EnvText.includes("SUPER_ADMIN_EMAIL=phase20@example.com"),
        true
      );

      const backupSourceRoot = path.join(phase20TempRoot, "backup-source");
      await fs.mkdir(path.join(backupSourceRoot, "backend/src/database/json"), {
        recursive: true
      });
      await fs.mkdir(path.join(backupSourceRoot, "backend/uploads"), {
        recursive: true
      });
      await fs.mkdir(path.join(backupSourceRoot, "apps/front/dist"), {
        recursive: true
      });
      await fs.mkdir(path.join(backupSourceRoot, "apps/admin-panel/dist"), {
        recursive: true
      });
      await fs.writeFile(path.join(backupSourceRoot, ".env"), "PORT=4100\n", "utf-8");
      await fs.writeFile(
        path.join(backupSourceRoot, "backend/src/database/json/settings.json"),
        "{\"ok\":true}\n",
        "utf-8"
      );
      await fs.writeFile(
        path.join(backupSourceRoot, "backend/uploads/logo.txt"),
        "asset\n",
        "utf-8"
      );
      await fs.writeFile(
        path.join(backupSourceRoot, "apps/front/dist/index.html"),
        "<html>front</html>\n",
        "utf-8"
      );
      await fs.writeFile(
        path.join(backupSourceRoot, "apps/admin-panel/dist/index.html"),
        "<html>admin</html>\n",
        "utf-8"
      );
      await fs.writeFile(
        path.join(backupSourceRoot, "ecosystem.config.cjs"),
        "module.exports = {};\n",
        "utf-8"
      );
      await fs.writeFile(
        path.join(backupSourceRoot, "package.json"),
        "{\"name\":\"phase20-backup\"}\n",
        "utf-8"
      );

      const phase20BackupResult = await runNodeScript(backupRunnerScript, [
        "--source-root",
        backupSourceRoot,
        "--backup-dir",
        "snapshots",
        "--label",
        "phase20",
        "--retention-days",
        "30"
      ]);
      const phase20BackupSummary = parseJsonOutput(
        phase20BackupResult.stdout,
        "backup-runner"
      );
      assert.equal(phase20BackupSummary.entries.length >= 5, true);

      const restoreTargetRoot = path.join(phase20TempRoot, "restore-target");
      const phase20RestoreResult = await runNodeScript(restoreRunnerScript, [
        "--source",
        phase20BackupSummary.targetDir,
        "--target-root",
        restoreTargetRoot
      ]);
      const phase20RestoreSummary = parseJsonOutput(
        phase20RestoreResult.stdout,
        "restore-runner"
      );
      assert.equal(
        phase20RestoreSummary.restoredEntries.length,
        phase20BackupSummary.entries.length
      );
      const restoredFrontIndex = await fs.readFile(
        path.join(restoreTargetRoot, "apps/front/dist/index.html"),
        "utf-8"
      );
      assert.equal(restoredFrontIndex.includes("front"), true);

      const phase20SeedAuthPath = path.join(phase20TempRoot, "phase20-auth.json");
      const phase20SeedResult = await runNodeScript(
        seedAdminScript,
        ["--name", "Phase 20 Admin", "--mobile", "+919111111111"],
        {
          env: {
            AUTH_STORE_PATH: phase20SeedAuthPath,
            SUPER_ADMIN_EMAIL: "wizard.owner@example.com",
            SUPER_ADMIN_PASSWORD: "WizardAdmin@123"
          }
        }
      );
      const phase20SeedSummary = parseJsonOutput(
        phase20SeedResult.stdout,
        "seed-admin"
      );
      assert.equal(phase20SeedSummary.email, "wizard.owner@example.com");
      const phase20SeededStore = JSON.parse(
        await fs.readFile(phase20SeedAuthPath, "utf-8")
      );
      assert.equal(
        phase20SeededStore.staffUsers.some(
          (row) =>
            row.role === "super_admin" &&
            row.email === "wizard.owner@example.com"
        ),
        true
      );

      const phase20HealthResult = await runNodeScript(healthCheckScript, [
        "--url",
        `${baseUrl}/health`,
        "--timeout",
        "3000"
      ]);
      const phase20HealthSummary = parseJsonOutput(
        phase20HealthResult.stdout,
        "health-check"
      );
      assert.equal(phase20HealthSummary.results[0].status, 200);

      const phase20NginxResult = await runNodeScript(renderNginxScript, [
        "--deploy-root",
        backupSourceRoot,
        "--storefront-domain",
        "shop.phase20.example.com",
        "--admin-domain",
        "admin.phase20.example.com",
        "--api-domain",
        "api.phase20.example.com",
        "--backend-port",
        "4100",
        "--ssl",
        "true"
      ]);
      const phase20NginxText = String(phase20NginxResult.stdout || "");
      assert.equal(phase20NginxText.includes("listen 80;"), true);
      assert.equal(phase20NginxText.includes("listen 443 ssl http2;"), true);
      assert.equal(
        phase20NginxText.includes("server_name admin.phase20.example.com;"),
        true
      );
      assert.equal(
        phase20NginxText.includes("proxy_pass http://127.0.0.1:4100;"),
        true
      );
    } finally {
      await fs.rm(phase20TempRoot, { recursive: true, force: true });
    }

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

    // ── Phase 21: admin customer detail page endpoints ──────────────────────
    const phase21CustomerId = phase11AccountCustomerLogin.json.data.customer.id;

    const phase21GetCustomer = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase21GetCustomer.response.status, 200);
    assert.equal(phase21GetCustomer.json.data.id, phase21CustomerId);
    assert.equal(Array.isArray(phase21GetCustomer.json.data.savedAddresses), true);

    const phase21UpdateCustomer = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          name: "Phase 21 Renamed Customer",
          email: "phase21.renamed@example.com"
        })
      }
    );
    assert.equal(phase21UpdateCustomer.response.status, 200);
    assert.equal(phase21UpdateCustomer.json.data.name, "Phase 21 Renamed Customer");
    assert.equal(phase21UpdateCustomer.json.data.email, "phase21.renamed@example.com");

    const phase21Cart = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}/cart`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase21Cart.response.status, 200);
    assert.equal(Array.isArray(phase21Cart.json.data.items), true);

    const phase21CreateAddress = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}/addresses`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({
          label: "Phase 21 Office",
          name: "Phase 21 Renamed Customer",
          mobile: "+91-9898989898",
          addressLine1: "221B Phase 21 Street",
          city: "Hyderabad",
          state: "Telangana",
          stateCode: "36",
          pincode: "500051",
          country: "India"
        })
      }
    );
    assert.equal(phase21CreateAddress.response.status, 201);
    assert.equal(phase21CreateAddress.json.data.label, "Phase 21 Office");
    const phase21AddressId = phase21CreateAddress.json.data.id;
    assert.equal(Boolean(phase21AddressId), true);

    const phase21ListAddresses = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}/addresses`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase21ListAddresses.response.status, 200);
    assert.equal(
      phase21ListAddresses.json.data.some((row) => row.id === phase21AddressId),
      true
    );

    const phase21UpdateAddress = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}/addresses/${phase21AddressId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ city: "Secunderabad" })
      }
    );
    assert.equal(phase21UpdateAddress.response.status, 200);
    assert.equal(phase21UpdateAddress.json.data.city, "Secunderabad");

    const phase21DeleteAddress = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}/addresses/${phase21AddressId}`,
      {
        method: "DELETE",
        headers: authHeaders(superAdminToken)
      }
    );
    assert.equal(phase21DeleteAddress.response.status, 200);
    assert.equal(phase21DeleteAddress.json.data.deleted, true);

    const phase21ListAddressesAfterDelete = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}/addresses`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase21ListAddressesAfterDelete.response.status, 200);
    assert.equal(
      phase21ListAddressesAfterDelete.json.data.some((row) => row.id === phase21AddressId),
      false
    );

    const phase21AbandonedByCustomer = await requestJson(
      baseUrl,
      `/api/admin/abandoned-carts?customerId=${phase21CustomerId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase21AbandonedByCustomer.response.status, 200);
    assert.equal(
      phase21AbandonedByCustomer.json.data.every((row) => row.userId === phase21CustomerId),
      true
    );

    // ── Phase 22: customer code, newsletter opt-in, account blocking ────────
    const phase22Customer = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase22Customer.response.status, 200);
    assert.equal(typeof phase22Customer.json.data.customerCode, "string");
    assert.equal(phase22Customer.json.data.customerCode.length > 0, true);
    assert.equal(phase22Customer.json.data.accountStatus, "active");
    assert.equal(phase22Customer.json.data.newsletterSubscribed, false);

    const phase22ProfileNewsletterOptIn = await requestJson(
      baseUrl,
      "/api/customer/account/profile",
      {
        method: "PATCH",
        headers: authHeaders(phase11AccountCustomerToken),
        body: JSON.stringify({ newsletterSubscribed: true })
      }
    );
    assert.equal(phase22ProfileNewsletterOptIn.response.status, 200);
    assert.equal(phase22ProfileNewsletterOptIn.json.data.newsletterSubscribed, true);

    const phase22AdminSeesNewsletter = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase22AdminSeesNewsletter.response.status, 200);
    assert.equal(phase22AdminSeesNewsletter.json.data.newsletterSubscribed, true);

    const phase22Block = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ accountStatus: "blocked" })
      }
    );
    assert.equal(phase22Block.response.status, 200);
    assert.equal(phase22Block.json.data.accountStatus, "blocked");

    const phase22BlockedOtpRequest = await requestJson(baseUrl, "/api/auth/customer/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: "+91-9898989898" })
    });
    assert.equal(phase22BlockedOtpRequest.response.status, 200);

    const phase22BlockedLoginAttempt = await requestJson(baseUrl, "/api/auth/customer/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9898989898",
        code: phase22BlockedOtpRequest.json.data.devCode
      })
    });
    assert.equal(phase22BlockedLoginAttempt.response.status, 403);

    const phase22Unblock = await requestJson(
      baseUrl,
      `/api/admin/customers/${phase21CustomerId}`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ accountStatus: "active" })
      }
    );
    assert.equal(phase22Unblock.response.status, 200);
    assert.equal(phase22Unblock.json.data.accountStatus, "active");

    const phase22UnblockedOtpRequest = await requestJson(baseUrl, "/api/auth/customer/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: "+91-9898989898" })
    });
    assert.equal(phase22UnblockedOtpRequest.response.status, 200);

    const phase22UnblockedLoginAttempt = await requestJson(baseUrl, "/api/auth/customer/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9898989898",
        code: phase22UnblockedOtpRequest.json.data.devCode
      })
    });
    assert.equal(phase22UnblockedLoginAttempt.response.status, 200);

    // ── Phase 23: reviews & ratings ──────────────────────────────────────────
    // Builds its own product + paid order rather than reusing createdProductId,
    // since that product gets hard-deleted by an earlier phase (Phase 19) and
    // would no longer exist by the time this phase runs.
    const phase23Product = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Phase 23 Review Test Speaker",
        categoryId,
        brand: "Jenix",
        mpn: "JNX-P23-REVIEW",
        hsnCode: "8525",
        basePrice: 1500,
        salePrice: 1400,
        deadWeightKg: 1,
        shortDescription: "Phase 23 test product for reviews.",
        fullDescription: "Phase 23 test product for reviews.",
        stockQty: 10,
        lowStockThreshold: 2
      })
    });
    assert.equal(phase23Product.response.status, 201);
    const phase23ProductId = phase23Product.json.data.id;

    const phase23CartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ productId: phase23ProductId, qty: 1 })
    });
    assert.equal(phase23CartAdd.response.status, 201);

    const phase23Checkout = await requestJson(baseUrl, "/api/checkout/start", {
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
    assert.equal(phase23Checkout.response.status, 200);
    const phase23CheckoutId = phase23Checkout.json.data.checkoutSession.id;

    const phase23Attempt = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ checkoutSessionId: phase23CheckoutId, gateway: "mock_online" })
    });
    assert.equal(phase23Attempt.response.status, 201);

    const phase23Webhook = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase23Attempt.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase23_review_01"
      })
    });
    assert.equal(phase23Webhook.response.status, 200);

    const phase23Submit = await requestJson(baseUrl, "/api/reviews", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        productId: phase23ProductId,
        rating: 5,
        title: "Phase 23 great product",
        comment: "Works exactly as described, easy to install."
      })
    });
    assert.equal(phase23Submit.response.status, 201);
    assert.equal(phase23Submit.json.data.status, "pending");
    const phase23ReviewId = phase23Submit.json.data.id;

    const phase23Duplicate = await requestJson(baseUrl, "/api/reviews", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        productId: phase23ProductId,
        rating: 4,
        title: "Second attempt",
        comment: "Trying to review the same product twice."
      })
    });
    assert.equal(phase23Duplicate.response.status, 409);

    const phase23AdminPendingList = await requestJson(
      baseUrl,
      "/api/admin/reviews?status=pending",
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase23AdminPendingList.response.status, 200);
    assert.equal(
      phase23AdminPendingList.json.data.some((row) => row.id === phase23ReviewId),
      true
    );

    const phase23Approve = await requestJson(
      baseUrl,
      `/api/admin/reviews/${phase23ReviewId}/moderate`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ action: "approve" })
      }
    );
    assert.equal(phase23Approve.response.status, 200);
    assert.equal(phase23Approve.json.data.status, "approved");

    const phase23ProductAfterApprove = await requestJson(
      baseUrl,
      `/api/admin/products/${phase23ProductId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase23ProductAfterApprove.response.status, 200);
    assert.equal(phase23ProductAfterApprove.json.data.reviewCount, 1);
    assert.equal(phase23ProductAfterApprove.json.data.avgRating, 5);

    const phase23PublicReviews = await requestJson(
      baseUrl,
      `/api/reviews?productId=${phase23ProductId}`
    );
    assert.equal(phase23PublicReviews.response.status, 200);
    assert.equal(phase23PublicReviews.json.data.summary.reviewCount, 1);
    assert.equal(
      phase23PublicReviews.json.data.reviews.some((row) => row.id === phase23ReviewId),
      true
    );

    // Switch to verified-purchase mode and confirm a customer with no order
    // for this product is blocked, before restoring/cleaning up.
    const phase23SettingsUpdate = await requestJson(
      baseUrl,
      "/api/admin/settings/review-settings",
      {
        method: "PUT",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ eligibility: "verified_purchase" })
      }
    );
    assert.equal(phase23SettingsUpdate.response.status, 200);
    assert.equal(phase23SettingsUpdate.json.data.eligibility, "verified_purchase");

    const phase23NoPurchaseOtpRequest = await requestJson(baseUrl, "/api/auth/customer/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: "+91-9797979797" })
    });
    assert.equal(phase23NoPurchaseOtpRequest.response.status, 200);

    const phase23NoPurchaseLogin = await requestJson(baseUrl, "/api/auth/customer/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mobile: "+91-9797979797",
        code: phase23NoPurchaseOtpRequest.json.data.devCode,
        name: "Phase 23 No Purchase Customer"
      })
    });
    assert.equal(phase23NoPurchaseLogin.response.status, 200);
    const phase23NoPurchaseToken = phase23NoPurchaseLogin.json.data.accessToken;

    const phase23BlockedSubmit = await requestJson(baseUrl, "/api/reviews", {
      method: "POST",
      headers: authHeaders(phase23NoPurchaseToken),
      body: JSON.stringify({
        productId: phase23ProductId,
        rating: 3,
        title: "Never bought this",
        comment: "Trying to review without a purchase."
      })
    });
    assert.equal(phase23BlockedSubmit.response.status, 403);

    // Delete the approved review, confirm the rollup resets, then submit a
    // fresh one (from the customer who DOES have a paid order — still
    // allowed under verified-purchase mode) and reject it this time.
    const phase23Delete = await requestJson(
      baseUrl,
      `/api/admin/reviews/${phase23ReviewId}`,
      { method: "DELETE", headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase23Delete.response.status, 200);

    const phase23ProductAfterDelete = await requestJson(
      baseUrl,
      `/api/admin/products/${phase23ProductId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase23ProductAfterDelete.response.status, 200);
    assert.equal(phase23ProductAfterDelete.json.data.reviewCount, 0);

    const phase23ResubmitAsVerifiedBuyer = await requestJson(baseUrl, "/api/reviews", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        productId: phase23ProductId,
        rating: 2,
        title: "Changed my mind",
        comment: "Resubmitting after the first review was deleted."
      })
    });
    assert.equal(phase23ResubmitAsVerifiedBuyer.response.status, 201);
    const phase23SecondReviewId = phase23ResubmitAsVerifiedBuyer.json.data.id;

    const phase23Reject = await requestJson(
      baseUrl,
      `/api/admin/reviews/${phase23SecondReviewId}/moderate`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ action: "reject", rejectionReason: "Does not follow review guidelines." })
      }
    );
    assert.equal(phase23Reject.response.status, 200);
    assert.equal(phase23Reject.json.data.status, "rejected");

    const phase23ProductAfterReject = await requestJson(
      baseUrl,
      `/api/admin/products/${phase23ProductId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase23ProductAfterReject.response.status, 200);
    assert.equal(phase23ProductAfterReject.json.data.reviewCount, 0);

    // ── Phase 24: partner product feed + referral attribution + commission ──
    const phase24Partner = await requestJson(baseUrl, "/api/admin/partners", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        name: "Phase 24 Partner B",
        commissionRatePercent: 10,
        attributionWindowDays: 7,
        returnUrl: "https://partnerb.example.com/deals"
      })
    });
    assert.equal(phase24Partner.response.status, 201);
    const phase24PartnerId = phase24Partner.json.data.id;
    const phase24PartnerCode = phase24Partner.json.data.code;
    const phase24ApiKey = phase24Partner.json.data.apiKey;

    const phase24Product = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Phase 24 Partner Feed Speaker",
        categoryId,
        brand: "Jenix",
        mpn: "JNX-P24-PARTNER",
        hsnCode: "8525",
        basePrice: 2000,
        salePrice: 1900,
        deadWeightKg: 1,
        shortDescription: "Phase 24 test product for partner feed.",
        fullDescription: "Phase 24 test product for partner feed.",
        stockQty: 10,
        lowStockThreshold: 2
      })
    });
    assert.equal(phase24Product.response.status, 201);
    const phase24ProductId = phase24Product.json.data.id;

    // Unassigned products must never leak into a partner's feed.
    const phase24FeedBeforeAssign = await requestJson(
      baseUrl,
      `/api/partner-feed/${phase24PartnerCode}?key=${phase24ApiKey}`
    );
    assert.equal(phase24FeedBeforeAssign.response.status, 200);
    assert.equal(phase24FeedBeforeAssign.json.data.productCount, 0);

    const phase24Assign = await requestJson(
      baseUrl,
      `/api/admin/partners/${phase24PartnerId}/products`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ productIds: [phase24ProductId] })
      }
    );
    assert.equal(phase24Assign.response.status, 200);

    const phase24Feed = await requestJson(
      baseUrl,
      `/api/partner-feed/${phase24PartnerCode}?key=${phase24ApiKey}`
    );
    assert.equal(phase24Feed.response.status, 200);
    assert.equal(phase24Feed.json.data.productCount, 1);
    const phase24FeedRow = phase24Feed.json.data.products[0];
    assert.equal(phase24FeedRow.id, phase24ProductId);
    assert.equal(phase24FeedRow.buyNowUrl.includes(`ref=${phase24PartnerCode}`), true);

    // Wrong/missing API key must be rejected, not silently serve the feed.
    const phase24FeedBadKey = await requestJson(
      baseUrl,
      `/api/partner-feed/${phase24PartnerCode}?key=wrong-key`
    );
    assert.equal(phase24FeedBadKey.response.status, 401);

    // The public resolve endpoint (backs the storefront's "Back to Partner"
    // banner) must expose name/returnUrl but never the feed API key.
    const phase24Resolve = await requestJson(
      baseUrl,
      `/api/partners/resolve/${phase24PartnerCode}`
    );
    assert.equal(phase24Resolve.response.status, 200);
    assert.equal(phase24Resolve.json.data.name, "Phase 24 Partner B");
    assert.equal(phase24Resolve.json.data.returnUrl, "https://partnerb.example.com/deals");
    assert.equal(phase24Resolve.json.data.apiKey, undefined);

    // Checkout #1: attribution captured just now -- well inside the 7-day
    // window, should ride onto the order and credit a commission once paid.
    const phase24CartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ productId: phase24ProductId, qty: 1 })
    });
    assert.equal(phase24CartAdd.response.status, 201);

    const phase24Checkout = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        paymentMethod: "online",
        shippingMethod: "standard",
        sourcePartnerCode: phase24PartnerCode,
        sourcePartnerCapturedAt: new Date().toISOString(),
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
    assert.equal(phase24Checkout.response.status, 200);
    const phase24CheckoutId = phase24Checkout.json.data.checkoutSession.id;

    const phase24Attempt = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ checkoutSessionId: phase24CheckoutId, gateway: "mock_online" })
    });
    assert.equal(phase24Attempt.response.status, 201);

    // Commission must not exist yet -- order is placed but not paid.
    const phase24LedgerBeforePaid = await requestJson(
      baseUrl,
      `/api/admin/partners/${phase24PartnerId}/commissions`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase24LedgerBeforePaid.response.status, 200);
    assert.equal(phase24LedgerBeforePaid.json.data.length, 0);

    const phase24Webhook = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase24Attempt.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase24_partner_01"
      })
    });
    assert.equal(phase24Webhook.response.status, 200);

    const phase24LedgerAfterPaid = await requestJson(
      baseUrl,
      `/api/admin/partners/${phase24PartnerId}/commissions`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase24LedgerAfterPaid.response.status, 200);
    assert.equal(phase24LedgerAfterPaid.json.data.length, 1);
    const phase24LedgerEntry = phase24LedgerAfterPaid.json.data[0];
    assert.equal(phase24LedgerEntry.partnerCode, phase24PartnerCode);
    assert.equal(phase24LedgerEntry.status, "pending");
    assert.equal(phase24LedgerEntry.commissionAmount, phase24LedgerEntry.commissionBase * 0.1);

    const phase24MarkPaid = await requestJson(
      baseUrl,
      `/api/admin/partners/commissions/${phase24LedgerEntry.id}/mark-paid`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ note: "Paid via bank transfer, phase 24 test." })
      }
    );
    assert.equal(phase24MarkPaid.response.status, 200);
    assert.equal(phase24MarkPaid.json.data.status, "paid");

    // Checkout #2: attribution captured 30 days ago, well outside the 7-day
    // window -- the order must place normally but carry NO attribution, so
    // no commission is credited even after payment succeeds.
    const phase24CartAdd2 = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ productId: phase24ProductId, qty: 1 })
    });
    assert.equal(phase24CartAdd2.response.status, 201);

    const phase24ExpiredCapturedAt = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const phase24Checkout2 = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        paymentMethod: "online",
        shippingMethod: "standard",
        sourcePartnerCode: phase24PartnerCode,
        sourcePartnerCapturedAt: phase24ExpiredCapturedAt,
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
    assert.equal(phase24Checkout2.response.status, 200);
    const phase24CheckoutId2 = phase24Checkout2.json.data.checkoutSession.id;

    const phase24Attempt2 = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ checkoutSessionId: phase24CheckoutId2, gateway: "mock_online" })
    });
    assert.equal(phase24Attempt2.response.status, 201);

    const phase24Webhook2 = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase24Attempt2.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase24_partner_02"
      })
    });
    assert.equal(phase24Webhook2.response.status, 200);

    const phase24LedgerAfterExpiredOrder = await requestJson(
      baseUrl,
      `/api/admin/partners/${phase24PartnerId}/commissions`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase24LedgerAfterExpiredOrder.response.status, 200);
    // Still exactly 1 -- the expired-attribution order added zero new rows.
    assert.equal(phase24LedgerAfterExpiredOrder.json.data.length, 1);

    // A garbage ?ref= code must never block checkout -- order places
    // normally with no attribution, exactly as if no ref was present.
    const phase24CartAdd3 = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ productId: phase24ProductId, qty: 1 })
    });
    assert.equal(phase24CartAdd3.response.status, 201);

    const phase24CheckoutBadCode = await requestJson(baseUrl, "/api/checkout/start", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        paymentMethod: "online",
        shippingMethod: "standard",
        sourcePartnerCode: "DOES-NOT-EXIST",
        sourcePartnerCapturedAt: new Date().toISOString(),
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
    assert.equal(phase24CheckoutBadCode.response.status, 200);

    // ── Phase 25: custom-print products -- add-on pricing, uploads, print jobs ──
    const phase25CustomOptions = [
      {
        id: "frequency",
        label: "Frequency Type",
        required: true,
        choices: [
          { id: "mifare", label: "Mifare", priceDelta: 15 },
          { id: "rfid", label: "RFID", priceDelta: 15 },
          { id: "none", label: "No Frequency", priceDelta: 0, default: true }
        ]
      },
      {
        id: "fixing",
        label: "Fixing Type",
        required: true,
        choices: [
          { id: "screw", label: "2-Screw Fix", priceDelta: 20, safeZoneTemplateId: "screw_2hole" },
          { id: "pocket", label: "Pocket-Friendly", priceDelta: 0, default: true }
        ]
      },
      {
        id: "finish",
        label: "Finish",
        required: true,
        choices: [
          { id: "matte", label: "Matte", priceDelta: 0, default: true },
          { id: "uv", label: "UV Protected", priceDelta: 40 }
        ]
      }
    ];
    const phase25PrintTemplates = [
      {
        id: "screw_2hole",
        label: "2-Screw Fix",
        holes: [
          { edge: "left", distanceFromSideMm: 8, distanceFromTopMm: 8, diameterMm: 3, marginMm: 1.5 },
          { edge: "right", distanceFromSideMm: 8, distanceFromTopMm: 8, diameterMm: 3, marginMm: 1.5 }
        ]
      }
    ];

    const phase25Product = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Phase 25 Custom Print Card",
        categoryId,
        brand: "Jenix",
        hsnCode: "8525",
        basePrice: 100,
        salePrice: 100,
        priceIncludesGst: false,
        shippingIncluded: false,
        deadWeightKg: 0.05,
        shippingClass: "normal",
        stockQty: 999,
        allowBackorder: true,
        fulfillmentType: "custom_print",
        uploadMode: "single_design",
        uploadSpec: {
          cardWidthMm: 85.6,
          cardHeightMm: 54,
          minWidthPx: 0,
          minHeightPx: 0,
          maxFileSizeMb: 20,
          allowedFormats: ["jpg", "png", "pdf"]
        },
        customOptions: phase25CustomOptions,
        printTemplates: phase25PrintTemplates
      })
    });
    assert.equal(phase25Product.response.status, 201);
    const phase25ProductId = phase25Product.json.data.id;
    assert.equal(phase25Product.json.data.fulfillmentType, "custom_print");

    // Strict-spec sibling product, used only to confirm dimension validation
    // actually rejects an undersized upload rather than silently accepting it.
    const phase25StrictProduct = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Phase 25 Strict Custom Print Card",
        categoryId,
        brand: "Jenix",
        hsnCode: "8525",
        basePrice: 100,
        deadWeightKg: 0.05,
        stockQty: 999,
        allowBackorder: true,
        fulfillmentType: "custom_print",
        uploadMode: "single_design",
        uploadSpec: { minWidthPx: 500, minHeightPx: 500, maxFileSizeMb: 20, allowedFormats: ["jpg", "png", "pdf"] },
        customOptions: [{ id: "opt", label: "Option", choices: [{ id: "a", label: "A", priceDelta: 0, default: true }] }]
      })
    });
    assert.equal(phase25StrictProduct.response.status, 201);
    const phase25StrictProductId = phase25StrictProduct.json.data.id;

    const phase25TinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AApMBgQnUnx0AAAAASUVORK5CYII=",
      "base64"
    );

    // Uploading without customer auth must be rejected outright.
    const phase25UnauthUploadForm = new FormData();
    phase25UnauthUploadForm.append("file", new Blob([phase25TinyPng], { type: "image/png" }), "design.png");
    phase25UnauthUploadForm.append("productId", phase25ProductId);
    const phase25UnauthUpload = await fetch(`${baseUrl}/api/print-uploads`, {
      method: "POST",
      body: phase25UnauthUploadForm
    });
    assert.equal(phase25UnauthUpload.status, 401);

    // Undersized image against the strict product's uploadSpec is rejected.
    const phase25RejectForm = new FormData();
    phase25RejectForm.append("file", new Blob([phase25TinyPng], { type: "image/png" }), "design.png");
    phase25RejectForm.append("productId", phase25StrictProductId);
    const phase25RejectUpload = await fetch(`${baseUrl}/api/print-uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${phase11AccountCustomerToken}` },
      body: phase25RejectForm
    });
    assert.equal(phase25RejectUpload.status, 400);

    // Same image against the permissive product succeeds.
    const phase25UploadForm = new FormData();
    phase25UploadForm.append("file", new Blob([phase25TinyPng], { type: "image/png" }), "design.png");
    phase25UploadForm.append("productId", phase25ProductId);
    const phase25UploadResponse = await fetch(`${baseUrl}/api/print-uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${phase11AccountCustomerToken}` },
      body: phase25UploadForm
    });
    const phase25UploadJson = await phase25UploadResponse.json();
    assert.equal(phase25UploadResponse.status, 201);
    const phase25UploadId = phase25UploadJson.data.id;

    // The stored file must only ever be reachable through admin auth.
    const phase25UnauthFile = await fetch(`${baseUrl}/api/admin/print-uploads/${phase25UploadId}/file`);
    assert.equal(phase25UnauthFile.status, 401);
    const phase25AdminFile = await fetch(`${baseUrl}/api/admin/print-uploads/${phase25UploadId}/file`, {
      headers: authHeaders(superAdminToken)
    });
    assert.equal(phase25AdminFile.status, 200);

    // Crop persistence: buyer drags/zooms to choose which part of the photo
    // shows through the card cutout -- must be saved server-side (so the
    // admin's Print Jobs review renders the same framing) and only the
    // uploading customer may update it.
    const phase25UnauthCrop = await fetch(`${baseUrl}/api/print-uploads/${phase25UploadId}/crop`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ panX: 0.5, panY: 0.5, zoom: 1.5 })
    });
    assert.equal(phase25UnauthCrop.status, 401);

    const phase25OtherCrop = await fetch(`${baseUrl}/api/print-uploads/${phase25UploadId}/crop`, {
      method: "PATCH",
      headers: authHeaders(phase11OtherCustomerToken),
      body: JSON.stringify({ panX: 0.5, panY: 0.5, zoom: 1.5 })
    });
    assert.equal(phase25OtherCrop.status, 403);

    const phase25CropUpdate = await fetch(`${baseUrl}/api/print-uploads/${phase25UploadId}/crop`, {
      method: "PATCH",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ panX: 0.3, panY: 0.7, zoom: 1.8 })
    });
    const phase25CropJson = await phase25CropUpdate.json();
    assert.equal(phase25CropUpdate.status, 200);
    assert.deepEqual(phase25CropJson.data.crop, { panX: 0.3, panY: 0.7, zoom: 1.8 });

    // Add to cart with a specific option combination: 100 base + 15 (Mifare)
    // + 20 (2-Screw Fix) + 40 (UV Protected) = 175/unit -- confirms the
    // customOptions price-delta injection in buildCartLineFromItem.
    const phase25CartAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        productId: phase25ProductId,
        qty: 1,
        customization: { frequency: "mifare", fixing: "screw", finish: "uv" },
        designUploadIds: [phase25UploadId]
      })
    });
    assert.equal(phase25CartAdd.response.status, 201);
    const phase25Line = phase25CartAdd.json.data.items.find((row) => row.productId === phase25ProductId);
    assert.equal(phase25Line.unitPrice, 175);
    // taxableValue is the pre-GST line amount (unitPrice x qty, qty=1 here) --
    // confirms the add-on delta flowed into the same value GST gets computed
    // from, not just a display-only price.
    assert.equal(phase25Line.taxableValue, 175);
    assert.equal(phase25Line.customization.length, 3);
    assert.equal(phase25Line.designUploadIds[0], phase25UploadId);
    const phase25LineId = phase25Line.lineId;

    // Bumping qty via the lineId-aware update path must not drop the
    // customization/designUploadIds carried on that line.
    const phase25QtyUpdate = await requestJson(baseUrl, `/api/cart/items/${phase25ProductId}`, {
      method: "PATCH",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ qty: 2, lineId: phase25LineId })
    });
    assert.equal(phase25QtyUpdate.response.status, 200);
    const phase25UpdatedLine = phase25QtyUpdate.json.data.items.find((row) => row.lineId === phase25LineId);
    assert.equal(phase25UpdatedLine.qty, 2);
    assert.equal(phase25UpdatedLine.designUploadIds[0], phase25UploadId);
    assert.equal(phase25UpdatedLine.lineTotal > 0, true);

    // unique_batch mode: one add-to-cart call with 2 uploaded designs must
    // split into 2 separate lines (qty 1 each), never merge into one.
    const phase25BatchProduct = await requestJson(baseUrl, "/api/admin/products", {
      method: "POST",
      headers: authHeaders(superAdminToken),
      body: JSON.stringify({
        title: "Phase 25 Batch Custom Print Card",
        categoryId,
        brand: "Jenix",
        hsnCode: "8525",
        basePrice: 100,
        deadWeightKg: 0.05,
        stockQty: 999,
        allowBackorder: true,
        fulfillmentType: "custom_print",
        uploadMode: "unique_batch",
        uploadSpec: { minWidthPx: 0, minHeightPx: 0, maxFileSizeMb: 20, allowedFormats: ["jpg", "png", "pdf"] },
        customOptions: [{ id: "opt", label: "Option", choices: [{ id: "a", label: "A", priceDelta: 0, default: true }] }]
      })
    });
    assert.equal(phase25BatchProduct.response.status, 201);
    const phase25BatchProductId = phase25BatchProduct.json.data.id;

    const phase25BatchUploadIds = [];
    for (const filename of ["card-a.png", "card-b.png"]) {
      const form = new FormData();
      form.append("file", new Blob([phase25TinyPng], { type: "image/png" }), filename);
      form.append("productId", phase25BatchProductId);
      const response = await fetch(`${baseUrl}/api/print-uploads`, {
        method: "POST",
        headers: { authorization: `Bearer ${phase11AccountCustomerToken}` },
        body: form
      });
      const json = await response.json();
      assert.equal(response.status, 201);
      phase25BatchUploadIds.push(json.data.id);
    }

    const phase25BatchAdd = await requestJson(baseUrl, "/api/cart/items", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({
        productId: phase25BatchProductId,
        qty: 1,
        customization: { opt: "a" },
        designUploadIds: phase25BatchUploadIds
      })
    });
    assert.equal(phase25BatchAdd.response.status, 201);
    const phase25BatchLines = phase25BatchAdd.json.data.items.filter(
      (row) => row.productId === phase25BatchProductId
    );
    assert.equal(phase25BatchLines.length, 2);
    assert.equal(phase25BatchLines.every((row) => row.qty === 1), true);
    assert.equal(
      new Set(phase25BatchLines.map((row) => row.lineId)).size,
      2,
      "each split line must have its own distinct lineId"
    );

    // Checkout + pay the single_design line, confirm the order carries the
    // customization/designUploadIds through, and that it shows up as a
    // print job only once payment is confirmed (never at order placement).
    const phase25Checkout = await requestJson(baseUrl, "/api/checkout/start", {
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
    assert.equal(phase25Checkout.response.status, 200);
    const phase25CheckoutId = phase25Checkout.json.data.checkoutSession.id;

    const phase25JobsBeforePaid = await requestJson(baseUrl, "/api/admin/print-jobs", {
      headers: authHeaders(superAdminToken)
    });
    const phase25JobCountBeforePaid = phase25JobsBeforePaid.json.data.length;

    const phase25Attempt = await requestJson(baseUrl, "/api/payments/create-attempt", {
      method: "POST",
      headers: authHeaders(phase11AccountCustomerToken),
      body: JSON.stringify({ checkoutSessionId: phase25CheckoutId, gateway: "mock_online" })
    });
    assert.equal(phase25Attempt.response.status, 201);

    const phase25Webhook = await requestJson(baseUrl, "/api/payments/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: phase25Attempt.json.data.attemptId,
        status: "success",
        gatewayTxnId: "txn_phase25_print_01"
      })
    });
    assert.equal(phase25Webhook.response.status, 200);

    const phase25JobsAfterPaid = await requestJson(baseUrl, "/api/admin/print-jobs", {
      headers: authHeaders(superAdminToken)
    });
    // The whole cart (both the single_design line and the 2 batch lines)
    // gets paid together, so all 3 print jobs should now exist.
    assert.equal(phase25JobsAfterPaid.json.data.length, phase25JobCountBeforePaid + 3);

    const phase25Job = phase25JobsAfterPaid.json.data.find(
      (row) => row.productId === phase25ProductId
    );
    assert.ok(phase25Job, "expected a print job for the single_design line");
    assert.equal(phase25Job.status, "needs_review");
    assert.equal(phase25Job.customization.length, 3);
    assert.equal(phase25Job.designUploadIds[0], phase25UploadId);

    const phase25JobDetail = await requestJson(
      baseUrl,
      `/api/admin/print-jobs/${phase25Job.orderId}/${phase25Job.lineId}`,
      { headers: authHeaders(superAdminToken) }
    );
    assert.equal(phase25JobDetail.response.status, 200);
    assert.equal(phase25JobDetail.json.data.uploads.length, 1);
    assert.equal(phase25JobDetail.json.data.printTemplate.id, "screw_2hole");

    const phase25Approve = await requestJson(
      baseUrl,
      `/api/admin/print-jobs/${phase25Job.orderId}/${phase25Job.lineId}/moderate`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ action: "approve" })
      }
    );
    assert.equal(phase25Approve.response.status, 200);
    assert.equal(phase25Approve.json.data.status, "approved");

    const phase25BatchJob = phase25JobsAfterPaid.json.data.find(
      (row) => row.productId === phase25BatchProductId
    );
    assert.ok(phase25BatchJob, "expected a print job for a batch line");
    const phase25Reject = await requestJson(
      baseUrl,
      `/api/admin/print-jobs/${phase25BatchJob.orderId}/${phase25BatchJob.lineId}/moderate`,
      {
        method: "PATCH",
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ action: "reject", rejectionReason: "Resolution too low for this batch card." })
      }
    );
    assert.equal(phase25Reject.response.status, 200);
    assert.equal(phase25Reject.json.data.status, "rejected");

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
