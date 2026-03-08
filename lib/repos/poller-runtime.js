const storage = require('../storage');

const ACTIVE_POLLER_WORKSPACE_KEY = 'poller-active-workspace';
const DEFAULT_POLLER_RUNTIME_TTL_SECONDS = 30 * 24 * 60 * 60;

async function getActivePollerWorkspace() {
  return storage.get(ACTIVE_POLLER_WORKSPACE_KEY);
}

async function setActivePollerWorkspace(workspaceId, { ttlSeconds = DEFAULT_POLLER_RUNTIME_TTL_SECONDS } = {}) {
  if (!workspaceId) return null;

  const record = {
    workspaceId,
    updatedAt: new Date().toISOString(),
  };

  await storage.set(ACTIVE_POLLER_WORKSPACE_KEY, record, ttlSeconds);
  return record;
}

module.exports = {
  ACTIVE_POLLER_WORKSPACE_KEY,
  DEFAULT_POLLER_RUNTIME_TTL_SECONDS,
  getActivePollerWorkspace,
  setActivePollerWorkspace,
};
