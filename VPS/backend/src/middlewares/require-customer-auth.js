const { HttpError } = require("../common/http-error");

function requireCustomerAuth(req, _res, next) {
  if (!req.customer || !req.customer.id) {
    return next(
      new HttpError(
        401,
        "Customer authentication required. Use a valid Bearer access token."
      )
    );
  }

  return next();
}

module.exports = { requireCustomerAuth };
