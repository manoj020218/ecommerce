const service = require("./facebook-feed.service");
const { parseFacebookFeedRequest } = require("./facebook-feed.validator");

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

const publicFacebookProductFeed = asyncHandler(async (_req, res) => {
  parseFacebookFeedRequest();
  const xml = await service.generateFacebookProductFeedXml();
  res.type("application/xml");
  res.status(200).send(xml);
});

module.exports = {
  publicFacebookProductFeed
};
