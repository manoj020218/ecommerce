const service = require("./google-merchant.service");
const { parseMerchantFeedRequest } = require("./google-merchant.validator");

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

const publicMerchantFeed = asyncHandler(async (_req, res) => {
  parseMerchantFeedRequest();
  const xml = await service.generateGoogleMerchantFeedXml();
  res.type("application/xml");
  res.status(200).send(xml);
});

module.exports = {
  publicMerchantFeed
};
