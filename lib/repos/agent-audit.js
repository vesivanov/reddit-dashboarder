const storage = require('../storage');
const { DEFAULT_CONFIG_TTL_SECONDS } = require('./agent-configs');

const AUDIT_PREFIX = 'agent-audit:';
const MAX_AUDIT_ENTRIES = 100;

function buildAuditKey(scopeId) {
  return `${AUDIT_PREFIX}${scopeId}`;
}

async function listAuditEntries(scopeId) {
  if (!scopeId) return [];
  const entries = await storage.get(buildAuditKey(scopeId));
  return Array.isArray(entries) ? entries : [];
}

async function appendAuditEntry(scopeId, entry, { ttlSeconds = DEFAULT_CONFIG_TTL_SECONDS } = {}) {
  if (!scopeId || !entry) return entry;
  const entries = await listAuditEntries(scopeId);
  entries.unshift(entry);
  await storage.set(buildAuditKey(scopeId), entries.slice(0, MAX_AUDIT_ENTRIES), ttlSeconds);
  return entry;
}

module.exports = {
  AUDIT_PREFIX,
  MAX_AUDIT_ENTRIES,
  buildAuditKey,
  listAuditEntries,
  appendAuditEntry,
};
