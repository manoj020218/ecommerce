const path = require("node:path");
const { z, ZodError } = require("zod");
const { env } = require("../../config/env");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./print-uploads.service");

const uploadBodySchema = z.object({
  productId: z.string().trim().min(1)
});

const cropBodySchema = z.object({
  panX: z.number().min(0).max(1),
  panY: z.number().min(0).max(1),
  zoom: z.number().min(1).max(4)
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

const uploadDesign = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "No file was uploaded.");
  }
  const { productId } = uploadBodySchema.parse(req.body);
  const data = await service.uploadPrintDesign({
    file: req.file,
    productId,
    ownerType: "customer",
    ownerId: req.customer.id
  });
  return created(res, data, "Design uploaded.");
});

const updateCrop = asyncHandler(async (req, res) => {
  const crop = cropBodySchema.parse(req.body);
  const data = await service.updateUploadCrop(req.params.uploadId, crop, {
    ownerType: "customer",
    ownerId: req.customer.id
  });
  return ok(res, data, "Crop saved.");
});

const downloadUploadFile = asyncHandler(async (req, res) => {
  const record = await service.getUploadRecord(req.params.uploadId);
  const filePath = path.resolve(process.cwd(), env.printUploadsDir, record.storedFilename);

  if (req.query.inline === "1") {
    res.setHeader("Content-Type", record.mimeType);
    return res.sendFile(filePath);
  }
  return res.download(filePath, record.originalName);
});

module.exports = {
  uploadDesign,
  updateCrop,
  downloadUploadFile
};
