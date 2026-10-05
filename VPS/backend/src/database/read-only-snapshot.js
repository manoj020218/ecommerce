const fs = require("node:fs/promises");
const { env } = require("../config/env");

// Shared, read-only parsed copy of a JSON store (2026-10-04). Same design as
// the catalog snapshot in catalog-store.js (kept inline there, unchanged):
// - read() returns ONE parsed copy shared by all callers — they must never
//   modify it nor pass it to the store's write function;
// - invalidate() must be called by the store's write function (before and
//   after the file is replaced); the file's mtime/size is also checked on
//   every read, so scripts and manual edits are picked up;
// - deep-frozen in production; outside production a Proxy THROWS on any
//   write, so the regression suite catches misuse.
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function createReadOnlySnapshot({ filePath, readFresh, label }) {
  let generation = 0;
  let snapshot = null; // { generation, mtimeMs, size, data }
  let pending = null; // { key, promise }
  const proxies = new WeakMap();

  function readOnlyProxy(value) {
    if (!value || typeof value !== "object") return value;
    if (proxies.has(value)) return proxies.get(value);
    const fail = (_target, prop) => {
      throw new Error(`${label} snapshot is read-only (attempted write to "${String(prop)}") — use the normal read for code that modifies it`);
    };
    const proxy = new Proxy(value, {
      get: (target, prop, receiver) => readOnlyProxy(Reflect.get(target, prop, receiver)),
      set: fail,
      deleteProperty: fail,
      defineProperty: fail,
      setPrototypeOf: fail
    });
    proxies.set(value, proxy);
    return proxy;
  }

  function protect(data) {
    return env.nodeEnv === "production" ? deepFreeze(data) : readOnlyProxy(data);
  }

  function invalidate() {
    generation += 1;
    snapshot = null;
    pending = null;
  }

  async function read() {
    const startGeneration = generation;
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (_error) {
      return protect(await readFresh()); // no file yet: the normal read creates it
    }
    if (
      snapshot &&
      snapshot.generation === startGeneration &&
      snapshot.mtimeMs === stat.mtimeMs &&
      snapshot.size === stat.size
    ) {
      return snapshot.data;
    }
    const key = `${startGeneration}:${stat.mtimeMs}:${stat.size}`;
    if (!pending || pending.key !== key) {
      const promise = readFresh().then((parsed) => {
        const data = protect(parsed);
        // Keep it only if no write happened meanwhile (stat was taken before
        // the read, so newer content just causes one extra re-read later).
        if (generation === startGeneration) {
          snapshot = { generation: startGeneration, mtimeMs: stat.mtimeMs, size: stat.size, data };
        }
        return data;
      });
      const load = { key, promise };
      pending = load;
      promise
        .catch(() => {})
        .finally(() => {
          if (pending === load) pending = null;
        });
    }
    return pending.promise;
  }

  return { read, invalidate };
}

module.exports = { createReadOnlySnapshot };
