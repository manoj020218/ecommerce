const { z } = require("zod");

const sitemapTypeSchema = z.enum(["products", "categories", "blogs"]);

function parseSitemapType(value) {
  return sitemapTypeSchema.parse(value);
}

module.exports = { parseSitemapType };
