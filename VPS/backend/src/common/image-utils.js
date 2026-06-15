const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const WEBP_QUALITY = 85;
const MAX_WIDTH = 1200;
const THUMB_WIDTH = 400;

async function convertToWebp(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const mainPath = path.join(dir, `${base}.webp`);
  const thumbPath = path.join(dir, `${base}-thumb.webp`);

  // Convert + resize main image
  await sharp(inputPath)
    .rotate() // auto-orient from EXIF
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(mainPath);

  // Thumbnail
  await sharp(inputPath)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbPath);

  // Remove original only if we wrote to a different path
  if (inputPath !== mainPath) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
  }

  return { mainPath, thumbPath };
}

module.exports = { convertToWebp };
