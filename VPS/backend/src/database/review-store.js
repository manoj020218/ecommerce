const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultReviewStore } = require("../modules/reviews/reviews.model");

const reviewStorePath = path.resolve(process.cwd(), env.reviewStorePath);

let writeQueue = Promise.resolve();

async function ensureReviewStoreFile() {
  const directoryPath = path.dirname(reviewStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(reviewStorePath);
  } catch (_error) {
    await fs.writeFile(
      reviewStorePath,
      JSON.stringify(cloneDefaultReviewStore(), null, 2),
      "utf-8"
    );
  }
}

async function readReviewStore() {
  await ensureReviewStoreFile();
  const raw = await fs.readFile(reviewStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = reviewStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(reviewStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(reviewStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeReviewStore(store) {
  const result = writeQueue.then(async () => {
    await ensureReviewStoreFile();
    const tmpPath = reviewStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, reviewStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetReviewStoreForRegression() {
  const fallback = cloneDefaultReviewStore();
  await writeReviewStore(fallback);
  return fallback;
}

module.exports = {
  readReviewStore,
  writeReviewStore,
  resetReviewStoreForRegression
};
