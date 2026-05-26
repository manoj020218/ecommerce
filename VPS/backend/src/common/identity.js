const crypto = require("node:crypto");

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = { generateId, hashValue };
