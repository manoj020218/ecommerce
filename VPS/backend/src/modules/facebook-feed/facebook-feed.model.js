const { escapeXml } = require("../seo/seo.model");

function buildFacebookChannelXml(metadata, items) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n  <title>${escapeXml(metadata.title)}</title>\n  <link>${escapeXml(metadata.link)}</link>\n  <description>${escapeXml(metadata.description)}</description>\n${items}\n</channel>\n</rss>`;
}

module.exports = { buildFacebookChannelXml };
