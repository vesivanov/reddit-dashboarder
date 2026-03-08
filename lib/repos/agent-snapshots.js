const storage = require('../storage');
const { buildScopeId } = require('./agent-configs');

const SNAPSHOT_PREFIX = 'agent-snapshot:';
const LATEST_SNAPSHOT_PREFIX = 'agent-snapshot-latest:';
const DEFAULT_SNAPSHOT_TTL_SECONDS = 24 * 60 * 60;

function buildSnapshotKey(snapshotId) {
  return `${SNAPSHOT_PREFIX}${snapshotId}`;
}

function buildLatestSnapshotKey(scopeId) {
  return `${LATEST_SNAPSHOT_PREFIX}${scopeId}`;
}

function computeTtlSeconds(expiresAt, fallback = DEFAULT_SNAPSHOT_TTL_SECONDS, now = Date.now()) {
  const ms = Number(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return fallback;
  return Math.max(1, Math.ceil(ms / 1000));
}

function buildSnapshotId(token, syncedAt) {
  const safeToken = String(token || '').slice(0, 16).replace(/[^\w-]/g, '_');
  const stamp = Date.parse(syncedAt || '') || Date.now();
  return `snap_${safeToken}_${stamp.toString(36)}`;
}

function createAgentSnapshotFromSync(token, syncRecord, now = Date.now(), scopeId = buildScopeId(token)) {
  const snapshotId = buildSnapshotId(token, syncRecord?.syncedAt);

  return {
    snapshotId,
    scopeId,
    sourceSyncToken: token,
    sourceSyncedAt: syncRecord?.syncedAt || new Date(now).toISOString(),
    sourceTimestamp: syncRecord?.timestamp || syncRecord?.syncedAt || new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
    expiresAt: Number(syncRecord?.expiresAt) || (now + (DEFAULT_SNAPSHOT_TTL_SECONDS * 1000)),
    posts: Array.isArray(syncRecord?.posts) ? syncRecord.posts : [],
    filters: syncRecord?.filters || {},
  };
}

async function getAgentSnapshot(snapshotId) {
  if (!snapshotId) return null;
  return storage.get(buildSnapshotKey(snapshotId));
}

async function saveAgentSnapshot(snapshot, { ttlSeconds } = {}) {
  if (!snapshot?.snapshotId) return null;
  const effectiveTtl = ttlSeconds || computeTtlSeconds(snapshot.expiresAt);
  await storage.set(buildSnapshotKey(snapshot.snapshotId), snapshot, effectiveTtl);
  await storage.set(buildLatestSnapshotKey(snapshot.scopeId), {
    snapshotId: snapshot.snapshotId,
    scopeId: snapshot.scopeId,
    sourceSyncedAt: snapshot.sourceSyncedAt,
  }, effectiveTtl);
  return snapshot;
}

async function getLatestSnapshotRef(scopeId) {
  if (!scopeId) return null;
  return storage.get(buildLatestSnapshotKey(scopeId));
}

async function getLatestAgentSnapshot(scopeId) {
  const ref = await getLatestSnapshotRef(scopeId);
  if (!ref?.snapshotId) return null;
  return getAgentSnapshot(ref.snapshotId);
}

async function materializeAgentSnapshot(token, syncRecord, {
  now = Date.now(),
  scopeId = buildScopeId(token),
} = {}) {
  if (!token || !syncRecord) return null;
  const latest = await getLatestAgentSnapshot(scopeId);
  if (latest && latest.sourceSyncedAt === syncRecord.syncedAt) {
    return latest;
  }

  const snapshot = createAgentSnapshotFromSync(token, syncRecord, now, scopeId);
  return saveAgentSnapshot(snapshot, {
    ttlSeconds: computeTtlSeconds(snapshot.expiresAt, DEFAULT_SNAPSHOT_TTL_SECONDS, now),
  });
}

module.exports = {
  SNAPSHOT_PREFIX,
  LATEST_SNAPSHOT_PREFIX,
  DEFAULT_SNAPSHOT_TTL_SECONDS,
  buildSnapshotKey,
  buildLatestSnapshotKey,
  buildSnapshotId,
  computeTtlSeconds,
  createAgentSnapshotFromSync,
  getAgentSnapshot,
  saveAgentSnapshot,
  getLatestSnapshotRef,
  getLatestAgentSnapshot,
  materializeAgentSnapshot,
};
