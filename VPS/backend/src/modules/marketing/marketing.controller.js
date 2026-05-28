const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./marketing.service");
const {
  parseOfferPayload,
  parseOfferPatch,
  parseTemplatePatch,
  parsePreviewPayload,
  parseNotificationLogsQuery,
  parseOffersQuery,
  parseTemplateKey,
  parseNotifySubscriptionPayload,
  parseNotifySubscriptionsQuery
} = require("./marketing.validator");

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

const adminGetMarketingOverview = asyncHandler(async (_req, res) => {
  return ok(res, await service.getMarketingOverview(), "Marketing overview fetched.");
});

const adminListOffers = asyncHandler(async (req, res) => {
  return ok(res, await service.listOffers(parseOffersQuery(req.query || {})), "Offers fetched.");
});

const adminCreateOffer = asyncHandler(async (req, res) => {
  return created(res, await service.createOffer(parseOfferPayload(req.body), req.actor), "Offer created.");
});

const adminUpdateOffer = asyncHandler(async (req, res) => {
  return ok(res, await service.updateOffer(req.params.offerId, parseOfferPatch(req.body), req.actor), "Offer updated.");
});

const adminListEmailTemplates = asyncHandler(async (_req, res) => {
  return ok(res, await service.listEmailTemplates(), "Email templates fetched.");
});

const adminGetEmailTemplate = asyncHandler(async (req, res) => {
  return ok(res, await service.getEmailTemplate(parseTemplateKey(req.params.templateKey)), "Email template fetched.");
});

const adminUpdateEmailTemplate = asyncHandler(async (req, res) => {
  return ok(res, await service.updateEmailTemplate(parseTemplateKey(req.params.templateKey), parseTemplatePatch(req.body), req.actor), "Email template updated.");
});

const adminPreviewEmailTemplate = asyncHandler(async (req, res) => {
  const payload = parsePreviewPayload(req.body);
  return ok(res, await service.previewEmailTemplate(parseTemplateKey(req.params.templateKey), payload.variables), "Email template preview generated.");
});

const adminListNotificationLogs = asyncHandler(async (req, res) => {
  return ok(res, await service.listNotificationLogs(parseNotificationLogsQuery(req.query || {})), "Notification logs fetched.");
});

const adminListNotifySubscriptions = asyncHandler(async (req, res) => {
  return ok(
    res,
    await service.listNotifySubscriptions(parseNotifySubscriptionsQuery(req.query || {})),
    "Notify subscriptions fetched."
  );
});

const adminSendNotifySubscription = asyncHandler(async (req, res) => {
  return ok(
    res,
    await service.sendNotifySubscription(req.params.subscriptionId, req.actor),
    "Availability notification sent."
  );
});

const publicCreateNotifySubscription = asyncHandler(async (req, res) => {
  const payload = parseNotifySubscriptionPayload(req.body);
  return created(
    res,
    await service.createNotifySubscription(payload, {
      customerId: req.customer?.id || null
    }),
    "Notify subscription saved."
  );
});

module.exports = {
  adminGetMarketingOverview,
  adminListOffers,
  adminCreateOffer,
  adminUpdateOffer,
  adminListEmailTemplates,
  adminGetEmailTemplate,
  adminUpdateEmailTemplate,
  adminPreviewEmailTemplate,
  adminListNotificationLogs,
  adminListNotifySubscriptions,
  adminSendNotifySubscription,
  publicCreateNotifySubscription
};
