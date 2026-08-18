const { z, ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./print-jobs.service");

const listQuerySchema = z.object({
  status: z.enum(["needs_review", "approved", "rejected"]).optional()
});

const moderateSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().trim().max(500).optional().default("")
});

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

const adminListPrintJobs = asyncHandler(async (req, res) => {
  const filters = listQuerySchema.parse(req.query || {});
  const data = await service.listPrintJobs(filters);
  return ok(res, data, "Print jobs fetched.");
});

const adminGetPrintJob = asyncHandler(async (req, res) => {
  const data = await service.getPrintJob(req.params.orderId, req.params.lineId);
  return ok(res, data, "Print job fetched.");
});

const adminModeratePrintJob = asyncHandler(async (req, res) => {
  const payload = moderateSchema.parse(req.body);
  const data = await service.moderatePrintJob(
    req.params.orderId,
    req.params.lineId,
    payload,
    req.actor
  );
  return ok(res, data, "Print job updated.");
});

module.exports = {
  adminListPrintJobs,
  adminGetPrintJob,
  adminModeratePrintJob
};
