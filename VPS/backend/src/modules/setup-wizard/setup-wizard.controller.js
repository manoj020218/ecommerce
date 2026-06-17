const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./setup-wizard.service");
const {
  parseStepKey,
  parseSetupWizardStepPayload
} = require("./setup-wizard.validator");

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

const publicGetSetupWizardBootstrap = asyncHandler(async (_req, res) => {
  const data = await service.getPublicSetupWizardBootstrap();
  return ok(res, data, "Setup wizard bootstrap fetched.");
});

const adminGetSetupWizard = asyncHandler(async (_req, res) => {
  const data = await service.getAdminSetupWizard();
  return ok(res, data, "Setup wizard fetched.");
});

const adminSaveSetupWizardStep = asyncHandler(async (req, res) => {
  const stepKey = parseStepKey(req.params.stepKey);
  const payload = parseSetupWizardStepPayload(stepKey, req.body);
  const data = await service.saveSetupWizardStep(stepKey, payload, req.actor);
  return ok(res, data, "Setup wizard step saved.");
});

const adminCompleteSetupWizard = asyncHandler(async (req, res) => {
  const data = await service.completeSetupWizard(req.actor);
  return ok(res, data, "Setup wizard marked complete.");
});

module.exports = {
  publicGetSetupWizardBootstrap,
  adminGetSetupWizard,
  adminSaveSetupWizardStep,
  adminCompleteSetupWizard
};
