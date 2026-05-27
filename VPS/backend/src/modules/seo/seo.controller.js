const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const service = require("./seo.service");
const { parseSitemapType } = require("./seo.validator");

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

const publicSitemapIndex = asyncHandler(async (_req, res) => {
  const xml = await service.generateSitemapIndexXml();
  res.type("application/xml");
  res.status(200).send(xml);
});

const publicTypedSitemap = asyncHandler(async (req, res) => {
  const type = parseSitemapType(req.params.type);
  const xml = await service.generateTypedSitemapXml(type);
  res.type("application/xml");
  res.status(200).send(xml);
});

module.exports = {
  publicSitemapIndex,
  publicTypedSitemap
};
