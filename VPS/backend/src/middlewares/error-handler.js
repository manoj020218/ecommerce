const { HttpError } = require("../common/http-error");

function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 ? "Internal server error" : error.message || "Request failed";

  if (statusCode === 500) {
    // Unexpected errors were previously swallowed entirely — the client got
    // a generic message and nothing was ever logged server-side, so a real
    // bug could only be diagnosed by reproducing it live with logging added
    // on the spot. Log the actual error so it's visible in `pm2 logs`.
    // eslint-disable-next-line no-console
    console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, error);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    details: error.details || undefined
  });
}

module.exports = { notFoundHandler, errorHandler };
