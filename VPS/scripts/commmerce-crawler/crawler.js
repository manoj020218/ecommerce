import { chromium } from "playwright";
import * as cheerio from "cheerio";
import slugify from "slugify";
import path from "path";
import {
  SITE_URL,
  REQUEST_DELAY_MS,
  SELECTORS,
  SITEMAP_PATHS,
  CATEGORY_SEED_PATHS,
  PRODUCT_URL_PATTERNS,
  BLOCKED_PATH_PATTERNS,
} from "./config.js";
import { processProductImages } from "./image-processor.js";
import { appendRaw, loadJson, saveJson } from "./exporters.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeSlug(title) {
  return slugify(title || "product", { lower: true, strict: true });
}

function parsePrice(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[^\d.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * commmerce.com builder packs both prices into one container, e.g.:
 *   "₹ 1,390    ₹ 4,199  (Excluding 18 % tax)"
 * Extracts each ₹ N,NNN amount separately to avoid concatenation bugs.
 */
function parseCommmercePrice($) {
  const container = $(".productDetails .product-price-container").first();
  if (!container.length) return null;
  const text = container.text();
  const amounts = [...text.matchAll(/₹\s*([\d,]+)/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, "")))
    .filter((n) => n > 0 && n < 10_000_000);
  if (amounts.length === 0) return null;
  // First amount = sale price, second (if present) = MRP
  return { salePrice: amounts[0], mrp: amounts[1] || amounts[0] };
}

/** True for actual product images; rejects SVG icons and UI assets. */
function isProductImageUrl(src) {
  if (!src) return false;
  if (src.endsWith(".svg")) return false;
  if (src.includes("store-front-assets")) return false;
  if (src.startsWith("data:")) return false;
  if (src.includes("blank.gif") || src.includes("placeholder")) return false;
  return true;
}

function isBlocked(url) {
  try {
    const { pathname } = new URL(url);
    return BLOCKED_PATH_PATTERNS.some((p) => p.test(pathname));
  } catch {
    return true;
  }
}

function isProductUrl(url) {
  try {
    const { pathname } = new URL(url);
    return PRODUCT_URL_PATTERNS.some((p) => p.test(pathname));
  } catch {
    return false;
  }
}

function absoluteUrl(href, base) {
  if (!href) return null;
  try {
    if (href.startsWith("//")) return `https:${href}`;
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function sameDomain(url) {
  try {
    return new URL(url).hostname === new URL(SITE_URL).hostname;
  } catch {
    return false;
  }
}

/** Try each selector in order; return first non-empty result. */
function trySelectors($, selectors) {
  for (const sel of selectors) {
    try {
      const el = $(sel).first();
      const text = el.text().trim() || el.attr("content") || el.attr("value");
      if (text) return text;
    } catch {
      continue;
    }
  }
  return "";
}

/** Collect all image src/data-src URLs matching selectors. Stops at first selector with results. */
function collectImages($, selectors) {
  const seen = new Set();
  for (const sel of selectors) {
    try {
      $(sel).each((_, el) => {
        const src =
          $(el).attr("src") ||
          $(el).attr("data-src") ||
          $(el).attr("data-lazy-src") ||
          $(el).attr("data-original");
        if (src && isProductImageUrl(src)) seen.add(src);
      });
    } catch {
      continue;
    }
    if (seen.size > 0) break;
  }
  return [...seen];
}

/** Parse specifications from table rows or definition lists. */
function parseSpecs($, selectors) {
  const specs = {};
  for (const sel of selectors) {
    try {
      const el = $(sel).first();
      if (!el.length) continue;
      el.find("tr").each((_, row) => {
        const cells = $(row).find("td, th");
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim().replace(/:$/, "");
          const val = $(cells[1]).text().trim();
          if (key && val) specs[key] = val;
        }
      });
      el.find("dt").each((_, dt) => {
        const key = $(dt).text().trim().replace(/:$/, "");
        const val = $(dt).next("dd").text().trim();
        if (key && val) specs[key] = val;
      });
      if (Object.keys(specs).length > 0) break;
    } catch {
      continue;
    }
  }
  return specs;
}

// ─── Sitemap discovery ────────────────────────────────────────────────────────

async function fetchSitemapUrls(page) {
  const productUrls = new Set();

  for (const sitePath of SITEMAP_PATHS) {
    const url = `${SITE_URL}${sitePath}`;
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      if (!res || !res.ok()) continue;

      const xml = await page.content();
      const $ = cheerio.load(xml, { xmlMode: true });

      const nestedUrls = [];
      $("sitemap loc").each((_, el) => nestedUrls.push($(el).text().trim()));

      if (nestedUrls.length > 0) {
        console.log(`  [sitemap] Index: ${nestedUrls.length} nested sitemaps`);
        for (const nestedUrl of nestedUrls) {
          if (nestedUrl.toLowerCase().includes("product")) {
            try {
              await page.goto(nestedUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
              const nestedXml = await page.content();
              const $n = cheerio.load(nestedXml, { xmlMode: true });
              $n("url loc").each((_, el) => {
                const href = $n(el).text().trim();
                if (isProductUrl(href) && !isBlocked(href)) productUrls.add(href);
              });
              console.log(`  [sitemap] ${nestedUrl} → ${productUrls.size} products`);
            } catch { /* continue */ }
            await sleep(500);
          }
        }
        if (productUrls.size > 0) break;
      }

      $("url loc").each((_, el) => {
        const href = $(el).text().trim();
        if (isProductUrl(href) && !isBlocked(href)) productUrls.add(href);
      });

      if (productUrls.size > 0) {
        console.log(`  [sitemap] ${productUrls.size} product URLs in ${sitePath}`);
        break;
      }
    } catch (err) {
      console.log(`  [sitemap] ${sitePath} failed: ${err.message}`);
    }
    await sleep(500);
  }

  return [...productUrls];
}

// ─── Category crawl discovery ─────────────────────────────────────────────────

async function discoverFromCategories(page, existingUrls) {
  const productUrls = new Set(existingUrls);
  const visitedPages = new Set();
  const queue = [...CATEGORY_SEED_PATHS.map((p) => `${SITE_URL}${p}`)];

  while (queue.length > 0) {
    const url = queue.shift();
    if (visitedPages.has(url) || isBlocked(url)) continue;
    visitedPages.add(url);

    try {
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      if (!res || !res.ok()) continue;

      const html = await page.content();
      const $ = cheerio.load(html);

      let found = 0;
      for (const sel of SELECTORS.productLinks) {
        try {
          $(sel).each((_, el) => {
            const href = absoluteUrl($(el).attr("href"), url);
            if (href && sameDomain(href) && isProductUrl(href) && !isBlocked(href)) {
              if (!productUrls.has(href)) { productUrls.add(href); found++; }
            }
          });
        } catch { continue; }
      }

      $("a[href]").each((_, el) => {
        const href = absoluteUrl($(el).attr("href"), url);
        if (!href || !sameDomain(href) || isBlocked(href)) return;
        if (isProductUrl(href) && !productUrls.has(href)) { productUrls.add(href); found++; }
      });

      console.log(`  [discovery] ${url} → +${found} products (total: ${productUrls.size})`);

      for (const sel of SELECTORS.nextPage) {
        try {
          const nextHref = absoluteUrl($(`${sel}`).first().attr("href"), url);
          if (nextHref && sameDomain(nextHref) && !visitedPages.has(nextHref)) queue.push(nextHref);
        } catch { continue; }
      }

      $("a[href]").each((_, el) => {
        const href = absoluteUrl($(el).attr("href"), url);
        if (!href || !sameDomain(href) || isBlocked(href)) return;
        const { pathname } = new URL(href);
        const isCategory =
          /\/(category|categories|collection|collections|shop|store|products)\//i.test(pathname) ||
          /\/(cat)\//i.test(pathname);
        if (isCategory && !visitedPages.has(href)) queue.push(href);
      });
    } catch (err) {
      console.warn(`  [discovery] Failed: ${url} — ${err.message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return [...productUrls];
}

// ─── Single product page scraper ──────────────────────────────────────────────

export async function scrapePage(page, url) {
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  if (!res || !res.ok()) throw new Error(`HTTP ${res?.status()} for ${url}`);

  const html = await page.content();
  const $ = cheerio.load(html);

  const title = trySelectors($, SELECTORS.title);
  const shortDescription = trySelectors($, SELECTORS.shortDescription);
  const fullDescription = trySelectors($, SELECTORS.fullDescription);
  const category = trySelectors($, SELECTORS.category);
  const seoTitle = $("title").first().text().trim() || title;
  const seoDescription =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    "";

  // commmerce.com price extraction first; generic fallback otherwise
  const commmercePrice = parseCommmercePrice($);
  let salePrice, basePrice;
  if (commmercePrice) {
    salePrice = commmercePrice.salePrice;
    basePrice = commmercePrice.mrp;
  } else {
    const rawPrice = trySelectors($, SELECTORS.price);
    const rawMrp = trySelectors($, SELECTORS.mrp);
    basePrice = parsePrice(rawMrp) || parsePrice(rawPrice);
    salePrice = parsePrice(rawPrice);
  }
  const discountPercent =
    basePrice > 0 && salePrice > 0 && basePrice > salePrice
      ? Math.round(((basePrice - salePrice) / basePrice) * 100)
      : 0;

  const rawImageUrls = collectImages($, SELECTORS.images);
  if (rawImageUrls.length === 0) rawImageUrls.push(...collectImages($, SELECTORS.mainImage));
  const ogImage = $("meta[property='og:image']").attr("content");
  if (ogImage && rawImageUrls.length === 0 && isProductImageUrl(ogImage)) rawImageUrls.push(ogImage);

  const specifications = parseSpecs($, SELECTORS.specifications);

  const keyFeatures = [];
  $(".key-features li, .product-features li, .features li, ul.features li").each((_, el) => {
    const text = $(el).text().trim();
    if (text) keyFeatures.push(text);
  });

  const slug = makeSlug(title || path.basename(new URL(url).pathname));

  return {
    title: title || "",
    slug,
    oldUrl: url,
    category: category || "",
    sku: "",
    brand: "",
    modelNumber: "",
    basePrice,
    salePrice: salePrice || basePrice,
    discountPercent,
    shortDescription,
    fullDescription,
    keyFeatures,
    specifications,
    rawImageUrls: [...new Set(rawImageUrls)],
    seoTitle,
    seoDescription,
    images: [],
    _scrapedAt: new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Step 1: discover all product URLs → output/urls.json */
export async function discoverUrls(outputDir) {
  const urlsFile = path.join(outputDir, "urls.json");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    console.log("[discover] Trying sitemap...");
    let urls = await fetchSitemapUrls(page);

    if (urls.length === 0) {
      console.log("[discover] No sitemap results — crawling category pages...");
      urls = await discoverFromCategories(page, []);
    } else {
      console.log("[discover] Supplementing with category crawl...");
      urls = await discoverFromCategories(page, urls);
    }

    const unique = [...new Set(urls)].filter((u) => !isBlocked(u));
    await saveJson(urlsFile, { urls: unique, discoveredAt: new Date().toISOString() });
    console.log(`[discover] Done. ${unique.length} product URLs → ${urlsFile}`);
    return unique;
  } finally {
    await browser.close();
  }
}

/** Step 2: scrape each product page → output/products_raw.json + output/images/ */
export async function crawlProducts(outputDir, imageDir, limit = Infinity) {
  const urlsFile = path.join(outputDir, "urls.json");
  const rawFile = path.join(outputDir, "products_raw.json");
  const failedFile = path.join(outputDir, "failed_urls.json");

  const urlData = await loadJson(urlsFile, { urls: [] });
  const urls = urlData.urls || [];

  if (urls.length === 0) {
    console.error("[crawl] No URLs found. Run discover first: node run.js --mode discover");
    return;
  }

  const existing = await loadJson(rawFile, []);
  const crawledUrls = new Set(existing.map((p) => p.oldUrl));
  const failed = await loadJson(failedFile, []);
  const failedUrls = new Set(failed.map((f) => f.url));

  const pending = urls.filter((u) => !crawledUrls.has(u) && !failedUrls.has(u));
  const todo = limit < Infinity ? pending.slice(0, limit) : pending;

  console.log(
    `[crawl] ${urls.length} total URLs | ${crawledUrls.size} already done | ${todo.length} to crawl`
  );

  if (todo.length === 0) {
    console.log("[crawl] Nothing new to crawl.");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  });
  const MAX_RETRIES = 2;

  try {
    for (let i = 0; i < todo.length; i++) {
      const url = todo[i];
      console.log(`\n[crawl] ${i + 1}/${todo.length} ${url}`);

      let product = null;
      let lastErr = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const page = await context.newPage();
        try {
          product = await scrapePage(page, url);
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`  [retry ${attempt + 1}] ${err.message}`);
          await sleep(2000 * (attempt + 1));
        } finally {
          await page.close();
        }
      }

      if (!product) {
        console.error(`  [fail] ${url} — ${lastErr?.message}`);
        const failedList = await loadJson(failedFile, []);
        failedList.push({ url, error: lastErr?.message, failedAt: new Date().toISOString() });
        await saveJson(failedFile, failedList);
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      if (product.rawImageUrls?.length > 0) {
        console.log(`  [img] Processing ${product.rawImageUrls.length} image(s)...`);
        product.images = await processProductImages(
          product.rawImageUrls,
          product.slug,
          imageDir,
          SITE_URL
        );
      }
      delete product.rawImageUrls;

      await appendRaw(rawFile, product);
      console.log(
        `  [ok] "${product.title}" | price: ${product.salePrice} | images: ${product.images.length}`
      );

      await sleep(REQUEST_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const finalRaw = await loadJson(rawFile, []);
  const finalFailed = await loadJson(failedFile, []);
  console.log(
    `\n[crawl] Done. ${finalRaw.length} products saved, ${finalFailed.length} failed.`
  );
}
