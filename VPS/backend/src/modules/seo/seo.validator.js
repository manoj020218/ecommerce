const { z } = require("zod");

// const sitemapTypeSchema = z.enum(["products", "categories", "blogs", "careers"]);
const sitemapTypeSchema = z.enum(["products", "categories", "blogs", "careers", "projects"]);

function parseSitemapType(value) {
  return sitemapTypeSchema.parse(value);
}

module.exports = { parseSitemapType };
