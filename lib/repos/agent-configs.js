const storage = require('../storage');

const AGENT_CONFIG_PREFIX = 'agent-config:';
const DEFAULT_CONFIG_TTL_SECONDS = 30 * 24 * 60 * 60;

function buildConfigKey(scopeId) {
  return `${AGENT_CONFIG_PREFIX}${scopeId}`;
}

function buildScopeId(token) {
  return `scope_${String(token || '').trim()}`;
}

async function getAgentConfig(scopeId) {
  if (!scopeId) return null;
  return storage.get(buildConfigKey(scopeId));
}

function createAgentConfigFromSync(scopeId, token, syncRecord, now = Date.now()) {
  const settings = syncRecord?.settings || {};

  return {
    scopeId,
    sourceSyncToken: token,
    subreddits: Array.isArray(settings.subreddits) ? settings.subreddits : [],
    filters: syncRecord?.filters || {},
    goals: settings.aiGoals || '',
    aiPrompt: settings.aiPrompt || '',
    threshold: settings.aiThreshold ?? 3,
    model: settings.openRouterModel || '',
    aiContext: settings.aiContext || '',
    scoringConfig: settings.scoringConfig || null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    version: 1,
  };
}

function deriveAgentConfigFromSync(scopeId, token, syncRecord, now = Date.now()) {
  return createAgentConfigFromSync(scopeId, token, syncRecord, now);
}

async function saveAgentConfig(scopeId, config, ttlSeconds = DEFAULT_CONFIG_TTL_SECONDS) {
  if (!scopeId || !config) return null;
  await storage.set(buildConfigKey(scopeId), config, ttlSeconds);
  return config;
}

async function compareAndSwapAgentConfig(scopeId, expectedConfig, nextConfig, ttlSeconds = DEFAULT_CONFIG_TTL_SECONDS) {
  if (!scopeId || !nextConfig) return { ok: false, current: null };
  return storage.compareAndSwap(
    buildConfigKey(scopeId),
    expectedConfig === undefined ? undefined : (expectedConfig || null),
    nextConfig,
    ttlSeconds
  );
}

async function ensureAgentConfigFromSync(token, syncRecord, {
  now = Date.now(),
  ttlSeconds = DEFAULT_CONFIG_TTL_SECONDS,
  scopeId = buildScopeId(token),
} = {}) {
  const existing = await getAgentConfig(scopeId);
  if (existing) {
    return existing;
  }

  const created = createAgentConfigFromSync(scopeId, token, syncRecord, now);
  return saveAgentConfig(scopeId, created, ttlSeconds);
}

async function updateAgentConfig(scopeId, updater, { ttlSeconds = DEFAULT_CONFIG_TTL_SECONDS } = {}) {
  const current = await getAgentConfig(scopeId);
  if (!current) return null;

  const next = await updater({ ...current });
  if (!next) return null;

  await saveAgentConfig(scopeId, next, ttlSeconds);
  return next;
}

module.exports = {
  DEFAULT_CONFIG_TTL_SECONDS,
  buildConfigKey,
  buildScopeId,
  getAgentConfig,
  createAgentConfigFromSync,
  deriveAgentConfigFromSync,
  saveAgentConfig,
  compareAndSwapAgentConfig,
  ensureAgentConfigFromSync,
  updateAgentConfig,
};
