const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultSettingsDocument } = require("../modules/settings/settings.model");

const settingsFilePath = path.resolve(process.cwd(), env.settingsStorePath);
const auditFilePath = path.resolve(process.cwd(), env.settingsAuditPath);

async function ensureFile(filePath, fallbackData) {
  const directoryPath = path.dirname(filePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(filePath);
  } catch (_error) {
    await fs.writeFile(filePath, JSON.stringify(fallbackData, null, 2), "utf-8");
  }
}

async function readJson(filePath, fallbackData) {
  await ensureFile(filePath, fallbackData);
  const fileText = await fs.readFile(filePath, "utf-8");

  try {
    return JSON.parse(fileText);
  } catch (parseError) {
    const backupPath = filePath + ".corrupted." + Date.now();
    try { await fs.copyFile(filePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(filePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeJson(filePath, payload) {
  await ensureFile(filePath, payload);
  const tmpPath = filePath + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

function createJsonFileStore() {
  return {
    async readSettingsDocument() {
      return readJson(settingsFilePath, cloneDefaultSettingsDocument());
    },
    async writeSettingsDocument(document) {
      await writeJson(settingsFilePath, document);
      return document;
    },
    async appendSettingsAuditLog(entry) {
      const existing = await readJson(auditFilePath, []);
      existing.push(entry);
      await writeJson(auditFilePath, existing);
      return entry;
    },
    async resetSettingsForRegression() {
      const resetDocument = cloneDefaultSettingsDocument();
      await writeJson(settingsFilePath, resetDocument);
      await writeJson(auditFilePath, []);
      return resetDocument;
    }
  };
}

const jsonFileStore = createJsonFileStore();

module.exports = {
  createJsonFileStore,
  jsonFileStore
};
