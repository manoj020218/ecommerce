import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import https from "https";
import http from "http";
import { IMAGE_SIZES } from "./config.js";

// commmerce.com CDN (cdn.commmerce.com) uses a certificate chain that fails
// Node's built-in verification on some corporate networks. Reuse one agent.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/** Download a remote image URL into a Buffer. Follows one redirect. */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const options = {
      timeout: 20000,
      ...(url.startsWith("https") ? { agent: httpsAgent } : {}),
    };
    const req = client.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout downloading ${url}`));
    });
  });
}

/** Make URL absolute if relative. */
function absoluteUrl(imageUrl, siteUrl) {
  if (!imageUrl) return null;
  try {
    if (imageUrl.startsWith("//")) return `https:${imageUrl}`;
    if (imageUrl.startsWith("http")) return imageUrl;
    const base = new URL(siteUrl);
    return new URL(imageUrl, base).href;
  } catch {
    return null;
  }
}

/**
 * Download one image, convert to WebP at thumbnail / medium / large sizes.
 * Returns { thumbnail, medium, large } as relative paths, or null on failure.
 *
 * Slug is truncated to 80 chars to stay within Windows MAX_PATH (260 chars).
 */
export async function processImage(rawUrl, slug, index, imageDir, siteUrl) {
  const url = absoluteUrl(rawUrl, siteUrl);
  if (!url) return null;

  const safeSlug = slug.length > 80 ? slug.substring(0, 80).replace(/-+$/, "") : slug;
  const folder = path.join(imageDir, safeSlug);
  await fs.mkdir(folder, { recursive: true });

  let buffer;
  try {
    buffer = await downloadImage(url);
  } catch (err) {
    console.warn(`  [img] Download failed: ${url} — ${err.message}`);
    return null;
  }

  const result = {};
  const prefix = `${index + 1}`;

  for (const [size, width] of Object.entries(IMAGE_SIZES)) {
    const filename = `${prefix}-${size}.webp`;
    const outPath = path.join(folder, filename);
    try {
      await sharp(buffer)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(outPath);
      result[size] = `images/${safeSlug}/${filename}`;
    } catch (err) {
      console.warn(`  [img] Resize failed (${size}): ${err.message}`);
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Process all images for a product.
 * Returns array of { original, thumbnail, medium, large }.
 */
export async function processProductImages(rawUrls, slug, imageDir, siteUrl) {
  const results = [];
  for (let i = 0; i < rawUrls.length; i++) {
    const processed = await processImage(rawUrls[i], slug, i, imageDir, siteUrl);
    if (processed) {
      results.push({ original: rawUrls[i], ...processed });
    }
  }
  return results;
}
