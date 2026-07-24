// One-time pass: sanitize fullDescription/shortDescription on all EXISTING products.
// These predate html-sanitizer.js being wired into the save path, so they still
// contain raw scraped HTML. New saves are already sanitized going forward; this
// catches up the existing 382 products. Safe, backup-first, dry-run by default.
//
// Usage: node scripts/sanitize-existing-descriptions.js [--apply]
const fs = require("fs");
const path = require("path");
const { sanitizeRichText } = require("../backend/src/common/html-sanitizer");

const P = path.resolve(__dirname, "../backend/src/database/json/catalog-store.json");
const apply = process.argv.includes("--apply");

const store = JSON.parse(fs.readFileSync(P, "utf-8"));
let changed = 0;

for (const p of store.products || []) {
  const nextFull = sanitizeRichText(p.fullDescription || "");
  const nextShort = sanitizeRichText(p.shortDescription || "");
  if (nextFull !== p.fullDescription || nextShort !== p.shortDescription) {
    if (apply) {
      p.fullDescription = nextFull;
      p.shortDescription = nextShort;
    }
    changed += 1;
  }
}

console.log(`${apply ? "APPLIED" : "DRY-RUN"} — products needing sanitization: ${changed} / ${(store.products || []).length}`);

if (apply) {
  fs.copyFileSync(P, P + ".bak-sanitize-" + Date.now());
  const tmp = P + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, P);
  console.log("Saved. Backup written next to catalog-store.json.");
}
