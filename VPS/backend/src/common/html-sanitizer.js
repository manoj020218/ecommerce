const sanitizeHtml = require("sanitize-html");

// Matches exactly what RichTextEditor's toolbar can produce (bold/italic/underline,
// lists, h2/h3/p, clear formatting) — nothing else is ever legitimately authored here.
// No attributes are allowed on any tag, which also strips event handlers (onerror,
// onload, etc.) and javascript: URLs since there is no href/src to preserve.
// const RICH_TEXT_OPTIONS = {
//   allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3"],
//   allowedAttributes: {},
//   disallowedTagsMode: "discard"
// };

// 2026-10-06: toolbar gained Link, Text colour, Highlight, Size, Spacing and
// Effects (user: pasted website links weren't clickable; wanted eye-catchers).
// Still a strict allowlist: links only http/https/mailto/tel and always open
// in a new tab with rel=noopener; inline styles limited to the exact values
// the toolbar produces; effects are a fixed set of jx-fx-* classes styled on
// the storefront. Everything else (script, on*, url(), position…) is dropped.
const COLOR_VALUE = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i];
const RICH_TEXT_FX_CLASSES = [
  "jx-fx-pulse", "jx-fx-blink", "jx-fx-shine", "jx-fx-badge", "jx-fx-underline", "jx-fx-shake"
];
const RICH_TEXT_OPTIONS = {
  allowedTags: [
    "p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3",
    "a", "span", "mark", "font"
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style", "class"],
    mark: ["style"],
    p: ["style"],
    li: ["style"],
    h2: ["style"],
    h3: ["style"]
  },
  allowedClasses: {
    span: RICH_TEXT_FX_CLASSES
  },
  allowedStyles: {
    "*": {
      color: COLOR_VALUE,
      "background-color": COLOR_VALUE,
      "font-weight": [/^(400|600|700|800|bold|normal)$/],
      "font-size": [/^(0\.85|1|1\.15|1\.35|1\.6)em$/],
      "letter-spacing": [/^(0|0\.05|0\.1|0\.2)em$/],
      "line-height": [/^(1\.4|1\.7|2)$/],
      "text-align": [/^(left|center|right)$/]
    }
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        target: "_blank",
        rel: "noopener noreferrer"
      }
    }),
    // execCommand("foreColor") without styleWithCSS emits <font color> —
    // convert to a styled span so the colour survives.
    font: (tagName, attribs) => ({
      tagName: "span",
      attribs: attribs.color ? { style: `color: ${attribs.color}` } : {}
    })
  },
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
