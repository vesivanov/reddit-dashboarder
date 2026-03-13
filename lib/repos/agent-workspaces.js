const storage = require('../storage');

const WORKSPACE_PREFIX = 'agent-workspace:';
const TOKEN_WORKSPACE_PREFIX = 'agent-workspace-token:';
const DEFAULT_WORKSPACE_TTL_SECONDS = 30 * 24 * 60 * 60;

function buildWorkspaceKey(workspaceId) {
  return `${WORKSPACE_PREFIX}${workspaceId}`;
}

function buildTokenWorkspaceKey(token) {
  return `${TOKEN_WORKSPACE_PREFIX}${token}`;
}

function generateWorkspaceId() {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getWorkspace(workspaceId) {
  if (!workspaceId) return null;
  return storage.get(buildWorkspaceKey(workspaceId));
}

async function getWorkspaceByToken(token) {
  if (!token) return null;
  const ref = await storage.get(buildTokenWorkspaceKey(token));
  if (!ref?.workspaceId) return null;
  return getWorkspace(ref.workspaceId);
}

async function saveWorkspace(workspace, ttlSeconds = DEFAULT_WORKSPACE_TTL_SECONDS) {
  if (!workspace?.workspaceId) return null;
  await storage.set(buildWorkspaceKey(workspace.workspaceId), workspace, ttlSeconds);
  if (workspace.sourceSyncToken) {
    await storage.set(buildTokenWorkspaceKey(workspace.sourceSyncToken), {
      workspaceId: workspace.workspaceId,
    }, ttlSeconds);
  }
  return workspace;
}

async function ensureWorkspaceForToken(token, {
  now = Date.now(),
  legacyScopeId = null,
  ttlSeconds = DEFAULT_WORKSPACE_TTL_SECONDS,
} = {}) {
  if (!token) return null;

  const existing = await getWorkspaceByToken(token);
  if (existing) return existing;

  const workspace = {
    workspaceId: legacyScopeId || generateWorkspaceId(),
    sourceSyncToken: token,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  return saveWorkspace(workspace, ttlSeconds);
}

module.exports = {
  DEFAULT_WORKSPACE_TTL_SECONDS,
  buildWorkspaceKey,
  buildTokenWorkspaceKey,
  generateWorkspaceId,
  getWorkspace,
  getWorkspaceByToken,
  saveWorkspace,
  ensureWorkspaceForToken,
};
