const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const catalogStorePath = path.resolve(process.cwd(), env.catalogStorePath);

const DEFAULT_CATALOG_STORE = Object.freeze({
  categories: [],
  hsnTaxMaster: [],
  products: [],
  inventoryMovements: []
});

// Mutex to prevent concurrent writes from corrupting the JSON file
let writeQueue = Promise.resolve();

function cloneDefaultCatalogStore() {
  return JSON.parse(JSON.stringify(DEFAULT_CATALOG_STORE));
}

async function ensureCatalogStoreFile() {
  const directoryPath = path.dirname(catalogStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(catalogStorePath);
  } catch (_error) {
    await fs.writeFile(
      catalogStorePath,
      JSON.stringify(cloneDefaultCatalogStore(), null, 2),
      "utf-8"
    );
  }
}

async function readCatalogStore() {
  await ensureCatalogStoreFile();
  const raw = await fs.readFile(catalogStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    // DO NOT overwrite the file here — preserve the corrupted file as a backup
    // so data can potentially be recovered. Throw instead.
    const backupPath = catalogStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(catalogStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error("catalog-store.json is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Original error: " + parseError.message);
  }
}

// ─── Read-only cached snapshot (2026-10-04) ────────────────────────────────
// readCatalogStore() re-reads + JSON.parses the whole file (~3.4 MB → ~8 MB
// heap) on every call, and one product page view called it ~7 times — that
// garbage is what pushed the backend into pm2 memory restarts.
//
// readCatalogStoreSnapshot() returns ONE shared parsed copy for READ-ONLY
// public paths (product page/list, categories, search, SSR). Rules:
// - callers must never modify it (or anything inside it) and must never pass
//   it to writeCatalogStore — anything that writes keeps using
//   readCatalogStore(), which still returns a fresh private copy;
// - the snapshot is dropped whenever writeCatalogStore() runs (generation
//   counter) or the file on disk changes (mtime/size — catches scripts and
//   manual edits), so it is never staler than a fresh read would be;
// - in production it is deep-frozen (an accidental write is ignored instead
//   of corrupting the shared copy); outside production it is wrapped in a
//   Proxy that THROWS on any write, so the regression suite catches misuse.
let snapshotGeneration = 0;
let snapshot = null; // { generation, mtimeMs, size, data }
let snapshotLoad = null; // { key, promise } — one parse shared by concurrent callers

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const readOnlyProxies = new WeakMap();
function readOnlyProxy(value) {
  if (!value || typeof value !== "object") return value;
  if (readOnlyProxies.has(value)) return readOnlyProxies.get(value);
  const fail = (_target, prop) => {
    throw new Error(`catalog snapshot is read-only (attempted write to "${String(prop)}") — use readCatalogStore() for code that modifies the catalog`);
  };
  const proxy = new Proxy(value, {
    get: (target, prop, receiver) => readOnlyProxy(Reflect.get(target, prop, receiver)),
    set: fail,
    deleteProperty: fail,
    defineProperty: fail,
    setPrototypeOf: fail
  });
  readOnlyProxies.set(value, proxy);
  return proxy;
}

function protectSnapshot(data) {
  return env.nodeEnv === "production" ? deepFreeze(data) : readOnlyProxy(data);
}

function invalidateCatalogSnapshot() {
  snapshotGeneration += 1;
  snapshot = null;
  snapshotLoad = null;
}

async function readCatalogStoreSnapshot() {
  const generation = snapshotGeneration;
  let stat;
  try {
    stat = await fs.stat(catalogStorePath);
  } catch (_error) {
    // No file yet: the normal read creates it. Don't cache this one.
    return protectSnapshot(await readCatalogStore());
  }
  if (
    snapshot &&
    snapshot.generation === generation &&
    snapshot.mtimeMs === stat.mtimeMs &&
    snapshot.size === stat.size
  ) {
    return snapshot.data;
  }

  const key = `${generation}:${stat.mtimeMs}:${stat.size}`;
  if (!snapshotLoad || snapshotLoad.key !== key) {
    const promise = readCatalogStore().then((parsed) => {
      const data = protectSnapshot(parsed);
      // Cache only if no write happened while we were reading. The stat was
      // taken BEFORE the read, so the content is at least as new as the stat;
      // if it is newer, the next call sees a different mtime/size and re-reads.
      if (snapshotGeneration === generation) {
        snapshot = { generation, mtimeMs: stat.mtimeMs, size: stat.size, data };
      }
      return data;
    });
    const load = { key, promise };
    snapshotLoad = load;
    promise
      .catch(() => {})
      .finally(() => {
        if (snapshotLoad === load) snapshotLoad = null;
      });
  }
  return snapshotLoad.promise;
}

async function writeCatalogStore(store) {
  // Any write makes the cached read-only snapshot stale (see above).
  invalidateCatalogSnapshot();
  // Serialize writes through a queue to prevent concurrent-write race conditions
  const result = writeQueue.then(async () => {
    await ensureCatalogStoreFile();
    // Atomic write: write to a temp file first, then rename over the real file.
    // If the write crashes halfway, the original file is untouched.
    const tmpPath = catalogStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, catalogStorePath);
    // Again after the file is replaced: a snapshot read that started while
    // this write was queued must not be kept.
    invalidateCatalogSnapshot();
    return store;
  });
  writeQueue = result.catch(() => { /* keep queue moving even on error */ });
  return result;
}

async function resetCatalogStoreForRegression() {
  const fallback = cloneDefaultCatalogStore();
  await writeCatalogStore(fallback);
  return fallback;
}

module.exports = {
  readCatalogStore,
  readCatalogStoreSnapshot,
  invalidateCatalogSnapshot,
  writeCatalogStore,
  resetCatalogStoreForRegression
};
