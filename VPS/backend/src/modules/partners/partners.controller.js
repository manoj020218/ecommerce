const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./partners.service");
const {
  parseCreatePartnerPayload,
  parseUpdatePartnerPayload,
  parseAssignProductsPayload,
  parseMarkCommissionPaidPayload,
  parseListCommissionsQuery,
  parsePartnerFeedQuery
} = require("./partners.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", { issues: error.issues });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(mapValidationError(error));
    }
  };
}

const adminCreatePartner = asyncHandler(async (req, res) => {
  const payload = parseCreatePartnerPayload(req.body);
  const data = await service.createPartner(payload, req.actor);
  return created(res, data, "Partner created.");
});

const adminListPartners = asyncHandler(async (req, res) => {
  const data = await service.listPartners();
  return ok(res, data, "Partners fetched.");
});

const adminGetPartner = asyncHandler(async (req, res) => {
  const data = await service.getPartner(req.params.partnerId);
  return ok(res, data, "Partner fetched.");
});

const adminUpdatePartner = asyncHandler(async (req, res) => {
  const payload = parseUpdatePartnerPayload(req.body);
  const data = await service.updatePartner(req.params.partnerId, payload, req.actor);
  return ok(res, data, "Partner updated.");
});

const adminDeletePartner = asyncHandler(async (req, res) => {
  const data = await service.deletePartner(req.params.partnerId, req.actor);
  return ok(res, data, "Partner deleted.");
});

const adminRegeneratePartnerApiKey = asyncHandler(async (req, res) => {
  const data = await service.regeneratePartnerApiKey(req.params.partnerId, req.actor);
  return ok(res, data, "API key regenerated.");
});

const adminAssignProducts = asyncHandler(async (req, res) => {
  const payload = parseAssignProductsPayload(req.body);
  const data = await service.assignProductsToPartner(
    req.params.partnerId,
    payload.productIds,
    req.actor
  );
  return ok(res, data, "Products assigned.");
});

const adminListCommissions = asyncHandler(async (req, res) => {
  const filters = parseListCommissionsQuery(req.query || {});
  const data = await service.listCommissionLedger(req.params.partnerId, filters);
  return ok(res, data, "Commission ledger fetched.");
});

const adminMarkCommissionPaid = asyncHandler(async (req, res) => {
  const payload = parseMarkCommissionPaidPayload(req.body);
  const data = await service.markCommissionPaid(req.params.ledgerId, payload, req.actor);
  return ok(res, data, "Commission marked paid.");
});

const publicResolvePartner = asyncHandler(async (req, res) => {
  const data = await service.resolvePartnerByCode(req.params.code);
  return ok(res, data, "Partner resolved.");
});

const publicPartnerFeed = asyncHandler(async (req, res) => {
  const query = parsePartnerFeedQuery(req.query || {});
  const data = await service.buildPartnerFeed(req.params.code, query.key);
  return ok(res, data, "Partner feed fetched.");
});

module.exports = {
  adminCreatePartner,
  adminListPartners,
  adminGetPartner,
  adminUpdatePartner,
  adminDeletePartner,
  adminRegeneratePartnerApiKey,
  adminAssignProducts,
  adminListCommissions,
  adminMarkCommissionPaid,
  publicResolvePartner,
  publicPartnerFeed
};
