const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./invoices.service");
const {
  parseListInvoicesQuery,
  parseGenerateInvoicePayload
} = require("./invoices.validator");

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

const adminListInvoices = asyncHandler(async (req, res) => {
  const filters = parseListInvoicesQuery(req.query || {});
  const data = await service.listInvoices(filters);
  return ok(res, data, "Invoices fetched.");
});

const adminGetInvoice = asyncHandler(async (req, res) => {
  const data = await service.getInvoiceById(req.params.invoiceId);
  return ok(res, data, "Invoice fetched.");
});

const adminGetInvoiceForOrder = asyncHandler(async (req, res) => {
  const data = await service.getInvoiceForOrder(req.params.orderId);
  return ok(res, data, "Invoice fetched for order.");
});

const adminGenerateInvoice = asyncHandler(async (req, res) => {
  const payload = parseGenerateInvoicePayload(req.body || {});
  const data = await service.generateInvoice(req.params.orderId, payload, req.actor);
  return ok(res, data, data.created ? "Invoice generated." : "Invoice already exists.");
});

const adminDownloadInvoice = asyncHandler(async (req, res) => {
  const data = await service.getInvoiceDownload(req.params.invoiceId);
  return ok(res, data, "Invoice download payload fetched.");
});

module.exports = {
  adminListInvoices,
  adminGetInvoice,
  adminGetInvoiceForOrder,
  adminGenerateInvoice,
  adminDownloadInvoice
};
