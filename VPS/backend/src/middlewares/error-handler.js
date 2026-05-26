const { HttpError } = require("../common/http-error");

function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 ? "Internal server error" : error.message || "Request failed";

  return res.status(statusCode).json({
    success: false,
    message,
    details: error.details || undefined
  });
}

module.exports = { notFoundHandler, errorHandler };
