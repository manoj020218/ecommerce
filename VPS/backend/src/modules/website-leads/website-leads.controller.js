const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./website-leads.service");
const {
  parseCreateWebsiteLeadPayload,
  parseListAdminWebsiteLeadsQuery,
  parseUpdateWebsiteLeadPayload
} = require("./website-leads.validator");

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

const publicCreateWebsiteLead = asyncHandler(async (req, res) => {
  const payload = parseCreateWebsiteLeadPayload(req.body);
  const data = await service.createWebsiteLead(payload);
  return created(res, data, "Website lead submitted.");
});

const adminListWebsiteLeads = asyncHandler(async (req, res) => {
  const query = parseListAdminWebsiteLeadsQuery(req.query || {});
  const data = await service.listAdminWebsiteLeads(query);
  return ok(res, data, "Website leads fetched.");
});

const adminUpdateWebsiteLead = asyncHandler(async (req, res) => {
  const patch = parseUpdateWebsiteLeadPayload(req.body);
  const data = await service.updateWebsiteLead(req.params.leadId, patch, req.actor);
  return ok(res, data, "Website lead updated.");
});

module.exports = {
  publicCreateWebsiteLead,
  adminListWebsiteLeads,
  adminUpdateWebsiteLead
};
