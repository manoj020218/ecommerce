const sanitizeHtml = require("sanitize-html");

// Matches exactly what RichTextEditor's toolbar can produce (bold/italic/underline,
// lists, h2/h3/p, clear formatting) — nothing else is ever legitimately authored here.
// No attributes are allowed on any tag, which also strips event handlers (onerror,
// onload, etc.) and javascript: URLs since there is no href/src to preserve.
const RICH_TEXT_OPTIONS = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3"],
  allowedAttributes: {},
  disallowedTagsMode: "discard"
};

function sanitizeRichText(value) {
  if (!value) {
    return value;
  }
  return sanitizeHtml(String(value), RICH_TEXT_OPTIONS);
}

// Broader preset for admin-authored CMS pages (About Us, Terms, etc.) rendered via
// dangerouslySetInnerHTML on the storefront. Still no script/style/event handlers,
// and links are restricted to http/https/mailto so javascript: URLs can't slip in.
const CMS_HTML_OPTIONS = {
  allowedTags: [
    "p", "br", "b", "strong", "i", "em", "u",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4",
    "a", "img", "blockquote", "table", "thead", "tbody", "tr", "th", "td"
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  disallowedTagsMode: "discard"
};

function sanitizeCmsHtml(value) {
  if (!value) {
    return value;
  }
  return sanitizeHtml(String(value), CMS_HTML_OPTIONS);
}

module.exports = { sanitizeRichText, sanitizeCmsHtml };
