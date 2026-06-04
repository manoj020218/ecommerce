# commmerce.com Site Crawler

A plug-and-play Node.js tool that migrates **all products** from any store built on the [commmerce.com](https://commmerce.com) website builder into a clean, import-ready dataset.

## What it does

| Step | Command | Output |
|------|---------|--------|
| Discover | `--mode discover` | `urls.json` — every product URL on the site |
| Crawl | `--mode crawl` | `products_raw.json` + WebP images |
| Export | `--mode export` | `products_clean.csv` + `products_import.json` |

**Scraped fields per product:**
- Title, slug, category
- Sale price + MRP (discount % auto-calculated)
- Short description, full description, key features
- Specifications table
- All gallery images → converted to WebP at 3 sizes (thumbnail 300px / medium 800px / large 1200px)
- SEO title + meta description
- Original URL (for 301 redirects)

---

## Requirements

- Node.js 18+
- Windows / macOS / Linux

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright's Chromium browser
npx playwright install chromium

# 3. Configure the target store
cp .env.example .env
# Edit .env and set:  SITE_URL=https://yourstore.com
```

---

## Usage

```bash
# Step 1 — find all product URLs (saves output/urls.json)
node run.js --mode discover

# Step 2a — test crawl with 10 products first (recommended)
node run.js --mode crawl --limit 10

# Step 2b — full crawl (resumable; skips already-crawled products)
node run.js --mode crawl

# Step 3 — export CSV + MongoDB JSON
node run.js --mode export

# Or run all three steps at once
node run.js --mode all
```

### npm shortcuts
```bash
npm run discover
npm run test:crawl   # limit 10
npm run crawl
npm run export
npm run full
```

---

## Output files

All files are written to `./output/` (configurable via `OUTPUT_DIR` in `.env`).

| File | Description |
|------|-------------|
| `urls.json` | All discovered product URLs |
| `products_raw.json` | Raw scraped data |
| `products_clean.csv` | Open in Excel — fill `hsnCode`, `gstRate`, category corrections |
| `products_import.json` | Ready for MongoDB `insertMany` |
| `migration_report.json` | Stats summary (totals, failures) |
| `failed_urls.json` | Products that could not be scraped |
| `images/<slug>/` | `1-thumbnail.webp`, `1-medium.webp`, `1-large.webp`, … |

---

## Configuration

Edit only **`config.js`** and **`.env`**.

### `.env` options

| Variable | Default | Description |
|----------|---------|-------------|
| `SITE_URL` | *(required)* | Public URL of the commmerce.com store |
| `REQUEST_DELAY_MS` | `1500` | Milliseconds between requests |
| `CONCURRENCY` | `2` | Playwright pages in parallel |
| `MAX_RETRIES` | `3` | Retries per failed page |
| `OUTPUT_DIR` | `./output` | Where to write JSON / CSV |
| `IMAGE_DIR` | `./output/images` | Where to write WebP images |

### Selector tuning

If a store has a custom theme, run:

```bash
node run.js --mode crawl --limit 1
```

Check the console output — if the title, price, or images look wrong, open `config.js` and adjust the relevant selectors array. All selectors are tried in order; the first match wins.

---

## Resume / incremental crawl

The crawler **auto-resumes** — it skips URLs already present in `products_raw.json`. If a crawl is interrupted, just run `node run.js --mode crawl` again.

---

## Platform notes

**commmerce.com specifics handled automatically:**
- Dual-price container (`"₹ 1,390    ₹ 4,199  (Excluding 18% tax)"`) — correctly splits sale price and MRP
- Gallery images use `side-img-0`, `side-img-1` … class names
- CDN SSL certificate (`cdn.commmerce.com`) — handled with `rejectUnauthorized: false`
- React SSR — pages are rendered by Playwright (headless Chromium), not just fetched with HTTP

**Windows users:**
- Long product slugs are truncated to 80 chars for folder names to stay within Windows MAX_PATH (260 chars)

---

## MongoDB import

After reviewing `products_clean.csv` in Excel (fill `hsnCode` and `gstRate`):

```js
// Example: bulk-import using mongosh or a Node.js script
const docs = require("./output/products_import.json");
await db.collection("products").insertMany(docs);
```

Use `oldUrl` on each document to set up 301 redirects from the old store URLs to the new site.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `SITE_URL is not set` | Edit `.env` and set `SITE_URL=https://...` |
| Chromium not found | Run `npx playwright install chromium` |
| SSL errors on images | Already handled; if you see new errors, check `image-processor.js` |
| Wrong title extracted | Adjust `SELECTORS.title` in `config.js` |
| Price = 0 or wrong | Check `.productDetails .product-price-container` exists on the page |
| Rate-limited / blocked | Increase `REQUEST_DELAY_MS` to 3000+ in `.env` |
| Crawl interrupted | Just re-run — it resumes automatically |
