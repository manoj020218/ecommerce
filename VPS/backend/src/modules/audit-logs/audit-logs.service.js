const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

async function addActivityLog(entry) {
  const store = await readAuthStore();

  const nextLog = {
    id: generateId("alog"),
    action: entry.action || "unknown.action",
    actorId: entry.actorId || "system",
    actorRole: entry.actorRole || "system",
    resourceType: entry.resourceType || "system",
    resourceId: entry.resourceId || null,
    metadata: safeMetadata(entry.metadata),
    createdAt: new Date().toISOString()
  };

  store.activityLogs.push(nextLog);
  await writeAuthStore(store);

  return nextLog;
}

async function listActivityLogs(filters) {
  const store = await readAuthStore();

  let logs = [...store.activityLogs];

  if (filters.actorId) {
    logs = logs.filter((log) => log.actorId === filters.actorId);
  }

  if (filters.action) {
    logs = logs.filter((log) => log.action === filters.action);
  }

  if (filters.resourceType) {
    logs = logs.filter((log) => log.resourceType === filters.resourceType);
  }

  logs.sort((a, b) => {
    const aTs = Date.parse(a.createdAt);
    const bTs = Date.parse(b.createdAt);
    return bTs - aTs;
  });

  return logs.slice(0, filters.limit);
}

module.exports = { addActivityLog, listActivityLogs };
