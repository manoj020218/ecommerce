const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore } = require("../../database/auth-store");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { readReviewStore, writeReviewStore } = require("../../database/review-store");
const { getAllSettings } = require("../settings/settings.service");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { notifyCustomerEvent } = require("../marketing/marketing.service");
const {
  REVIEW_STATUSES,
  REVIEW_ELIGIBILITY_MODES,
  sanitizeReview,
  toPublicReview
} = require("./reviews.model");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function findProduct(catalogStore, productId) {
  return ensureArray(catalogStore.products).find((row) => row.id === productId);
}

function findCustomer(authStore, customerId) {
  return ensureArray(authStore.users).find((row) => row.id === customerId);
}

// Same "did this customer actually buy this product" check the eligibility
// setting needs — nothing to reuse, no equivalent existed anywhere in the
// backend (confirmed before writing this). Payment must have actually gone
// through; a placed-but-unpaid order doesn't count as a verified purchase.
function customerHasPurchasedProduct(authStore, customerId, productId) {
  return ensureArray(authStore.orders).some(
    (order) =>
      order.ownerId === customerId &&
      order.paymentStatus === "paid" &&
      ensureArray(order.items).some((item) => item.productId === productId)
  );
}

function recalculateProductRating(catalogStore, reviewStore, productId) {
  const approved = ensureArray(reviewStore.reviews).filter(
    (row) => row.productId === productId && row.status === REVIEW_STATUSES.APPROVED
  );
  const reviewCount = approved.length;
  const avgRating = reviewCount
    ? Math.round((approved.reduce((sum, row) => sum + row.rating, 0) / reviewCount) * 10) / 10
    : 0;

  const index = ensureArray(catalogStore.products).findIndex((row) => row.id === productId);
  if (index >= 0) {
    catalogStore.products[index] = {
      ...catalogStore.products[index],
      avgRating,
      reviewCount,
      updatedAt: nowIso()
    };
  }
}

async function submitReview(customerId, payload) {
  if (!customerId) {
    throw new HttpError(401, "Login is required to submit a review.");
  }

  const [authStore, catalogStore, reviewStore, settings] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readReviewStore(),
    getAllSettings()
  ]);

  const product = findProduct(catalogStore, payload.productId);
  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  const customer = findCustomer(authStore, customerId);
  if (!customer) {
    throw new HttpError(404, "Customer not found.");
  }

  const eligibility = settings.reviewSettings.eligibility;
  if (
    eligibility === REVIEW_ELIGIBILITY_MODES.VERIFIED_PURCHASE &&
    !customerHasPurchasedProduct(authStore, customerId, payload.productId)
  ) {
    throw new HttpError(
      403,
      "Only customers who have purchased this product can leave a review."
    );
  }

  const duplicate = ensureArray(reviewStore.reviews).find(
    (row) => row.customerId === customerId && row.productId === payload.productId
  );
  if (duplicate) {
    throw new HttpError(409, "You have already reviewed this product.");
  }

  const autoApprove = settings.reviewSettings.moderationMode === "auto";
  const review = {
    id: generateId("review"),
    productId: product.id,
    productTitle: product.title,
    customerId,
    customerName: customer.name || "Customer",
    rating: payload.rating,
    title: payload.title,
    comment: payload.comment,
    status: autoApprove ? REVIEW_STATUSES.APPROVED : REVIEW_STATUSES.PENDING,
    rejectionReason: "",
    moderatedAt: autoApprove ? nowIso() : null,
    moderatedBy: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  reviewStore.reviews.push(review);

  if (autoApprove) {
    recalculateProductRating(catalogStore, reviewStore, product.id);
    await Promise.all([writeReviewStore(reviewStore), writeCatalogStore(catalogStore)]);
  } else {
    await writeReviewStore(reviewStore);
  }

  await addActivityLog({
    action: "reviews.submitted",
    actorId: customerId,
    actorRole: "customer",
    resourceType: "review",
    resourceId: review.id,
    metadata: { productId: product.id, status: review.status }
  });

  return sanitizeReview(review);
}

async function listAdminReviews(filters) {
  const reviewStore = await readReviewStore();
  let reviews = ensureArray(reviewStore.reviews);

  if (filters.status) {
    reviews = reviews.filter((row) => row.status === filters.status);
  }
  if (filters.productId) {
    reviews = reviews.filter((row) => row.productId === filters.productId);
  }

  reviews = reviews.sort(
    (a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")
  );

  return reviews.map(sanitizeReview);
}

async function getAdminReviewById(reviewId) {
  const reviewStore = await readReviewStore();
  const review = ensureArray(reviewStore.reviews).find((row) => row.id === reviewId);
  if (!review) {
    throw new HttpError(404, "Review not found.");
  }
  return sanitizeReview(review);
}

async function moderateReview(reviewId, payload, actor) {
  const [authStore, catalogStore, reviewStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readReviewStore()
  ]);

  const review = ensureArray(reviewStore.reviews).find((row) => row.id === reviewId);
  if (!review) {
    throw new HttpError(404, "Review not found.");
  }

  const customer = findCustomer(authStore, review.customerId);

  if (payload.action === "reject") {
    review.status = REVIEW_STATUSES.REJECTED;
    review.rejectionReason = payload.rejectionReason || "";
    review.moderatedAt = nowIso();
    review.moderatedBy = actor.id;
    review.updatedAt = nowIso();

    recalculateProductRating(catalogStore, reviewStore, review.productId);
    await Promise.all([writeReviewStore(reviewStore), writeCatalogStore(catalogStore)]);

    if (customer?.email) {
      await notifyCustomerEvent({
        eventKey: "review_rejected",
        toEmail: customer.email,
        toMobile: customer.mobile || "",
        relatedResourceType: "review",
        relatedResourceId: review.id,
        variables: {
          customerName: review.customerName,
          productName: review.productTitle,
          rejectionReason: review.rejectionReason || "Did not meet our review guidelines."
        }
      });
    }

    await addActivityLog({
      action: "reviews.rejected",
      actorId: actor.id,
      actorRole: actor.role,
      resourceType: "review",
      resourceId: review.id
    });

    return sanitizeReview(review);
  }

  review.status = REVIEW_STATUSES.APPROVED;
  review.rejectionReason = "";
  review.moderatedAt = nowIso();
  review.moderatedBy = actor.id;
  review.updatedAt = nowIso();

  recalculateProductRating(catalogStore, reviewStore, review.productId);
  await Promise.all([writeReviewStore(reviewStore), writeCatalogStore(catalogStore)]);

  if (customer?.email) {
    await notifyCustomerEvent({
      eventKey: "review_approved",
      toEmail: customer.email,
      toMobile: customer.mobile || "",
      relatedResourceType: "review",
      relatedResourceId: review.id,
      variables: {
        customerName: review.customerName,
        productName: review.productTitle
      }
    });
  }

  await addActivityLog({
    action: "reviews.approved",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "review",
    resourceId: review.id
  });

  return sanitizeReview(review);
}

async function deleteReview(reviewId, actor) {
  const [catalogStore, reviewStore] = await Promise.all([
    readCatalogStore(),
    readReviewStore()
  ]);

  const index = ensureArray(reviewStore.reviews).findIndex((row) => row.id === reviewId);
  if (index < 0) {
    throw new HttpError(404, "Review not found.");
  }

  const [removed] = reviewStore.reviews.splice(index, 1);
  const wasApproved = removed.status === REVIEW_STATUSES.APPROVED;

  if (wasApproved) {
    recalculateProductRating(catalogStore, reviewStore, removed.productId);
    await Promise.all([writeReviewStore(reviewStore), writeCatalogStore(catalogStore)]);
  } else {
    await writeReviewStore(reviewStore);
  }

  await addActivityLog({
    action: "reviews.deleted",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "review",
    resourceId: reviewId
  });

  return { id: reviewId, deleted: true };
}

async function listPublicReviewsForProduct(productId, filters = {}) {
  const reviewStore = await readReviewStore();
  const approved = ensureArray(reviewStore.reviews)
    .filter((row) => row.productId === productId && row.status === REVIEW_STATUSES.APPROVED)
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  const limit = Number(filters.limit || 20);
  const reviews = approved.slice(0, limit).map(toPublicReview);
  const reviewCount = approved.length;
  const avgRating = reviewCount
    ? Math.round((approved.reduce((sum, row) => sum + row.rating, 0) / reviewCount) * 10) / 10
    : 0;

  return {
    reviews,
    summary: { avgRating, reviewCount }
  };
}

module.exports = {
  submitReview,
  listAdminReviews,
  getAdminReviewById,
  moderateReview,
  deleteReview,
  listPublicReviewsForProduct
};
