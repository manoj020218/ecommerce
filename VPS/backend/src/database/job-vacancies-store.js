const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const jobVacanciesStorePath = path.resolve(process.cwd(), env.jobVacanciesStorePath);

const DEFAULT_JOB_VACANCIES_STORE = Object.freeze({
  jobVacancies: []
});

let writeQueue = Promise.resolve();

function cloneDefaultJobVacanciesStore() {
  return JSON.parse(JSON.stringify(DEFAULT_JOB_VACANCIES_STORE));
}

async function ensureJobVacanciesStoreFile() {
  const directoryPath = path.dirname(jobVacanciesStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(jobVacanciesStorePath);
  } catch (_error) {
    await fs.writeFile(
      jobVacanciesStorePath,
      JSON.stringify(cloneDefaultJobVacanciesStore(), null, 2),
      "utf-8"
    );
  }
}

async function readJobVacanciesStore() {
  await ensureJobVacanciesStoreFile();
  const raw = await fs.readFile(jobVacanciesStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = jobVacanciesStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(jobVacanciesStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(jobVacanciesStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeJobVacanciesStore(store) {
  const result = writeQueue.then(async () => {
    await ensureJobVacanciesStoreFile();
    const tmpPath = jobVacanciesStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, jobVacanciesStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetJobVacanciesStoreForRegression() {
  const fallback = cloneDefaultJobVacanciesStore();
  await writeJobVacanciesStore(fallback);
  return fallback;
}

module.exports = {
  cloneDefaultJobVacanciesStore,
  readJobVacanciesStore,
  writeJobVacanciesStore,
  resetJobVacanciesStoreForRegression
};
