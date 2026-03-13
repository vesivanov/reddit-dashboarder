const storage = require('../storage');

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function buildSyncRecord({ token, posts, settings, filters, timestamp, now = Date.now(), extra = {} }) {
  return {
    ...extra,
    token,
    posts: posts || [],
    settings: settings || {},
    filters: filters || {},
    timestamp: timestamp || new Date(now).toISOString(),
    syncedAt: new Date(now).toISOString(),
    expiresAt: now + (DEFAULT_TTL_SECONDS * 1000),
  };
}

async function saveSyncRecord(token, data, { now = Date.now() } = {}) {
  if (!token || !data) return null;
  const nextData = buildSyncRecord({
    token,
    posts: data.posts,
    settings: data.settings,
    filters: data.filters,
    timestamp: data.timestamp,
    now,
    extra: {
      ...(data.extra || {}),
      ...(data.source ? { source: data.source } : {}),
    },
  });
  await storage.set(token, nextData, DEFAULT_TTL_SECONDS);
  return nextData;
}

async function refreshSyncRecord(token, data, { now = Date.now() } = {}) {
  if (!token || !data) return null;
  const { posts, settings, filters, timestamp, token: _existingToken, syncedAt: _syncedAt, expiresAt: _expiresAt, ...passthrough } = data;
  return saveSyncRecord(token, {
    posts,
    settings,
    filters,
    timestamp,
    extra: passthrough,
  }, { now });
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  buildSyncRecord,
  saveSyncRecord,
  refreshSyncRecord,
};
