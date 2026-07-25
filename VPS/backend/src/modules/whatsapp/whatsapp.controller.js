const { ok } = require("../../common/http-response");
const service = require("./whatsapp.service");

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

const getStatus = asyncHandler(async (_req, res) => {
  return ok(res, service.getStatus(), "WhatsApp status fetched.");
});

const connect = asyncHandler(async (_req, res) => {
  const data = await service.startConnection();
  return ok(res, data, "WhatsApp connection started.");
});

const disconnect = asyncHandler(async (_req, res) => {
  const data = await service.disconnect();
  return ok(res, data, "WhatsApp disconnected.");
});

module.exports = { getStatus, connect, disconnect };
