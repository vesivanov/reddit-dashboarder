const storage = require('../storage');
const { identifySyncHotLeads } = require('./hot-leads');
const {
  buildScopeId,
  getAgentConfig,
  deriveAgentConfigFromSync,
  saveAgentConfig,
} = require('../repos/agent-configs');
const {
  DEFAULT_SNAPSHOT_TTL_SECONDS,
  createAgentSnapshot,
  getLatestAgentSnapshot,
  materializeAgentSnapshot,
  saveAgentSnapshot,
} = require('../repos/agent-snapshots');
const {
  getAgentAnalysis,
  saveAgentAnalysis,
} = require('../repos/agent-analyses');
const {
  getWorkspace,
  getWorkspaceByToken,
  ensureWorkspaceForToken,
  saveWorkspace,
} = require('../repos/agent-workspaces');
const { buildSyncRecord, saveSyncRecord } = require('./sync-records');

function mapHeuristicOpportunity(opportunity) {
  return {
    postId: opportunity.id,
    title: opportunity.title,
    subreddit: opportunity.subreddit,
    score: opportunity.score,
    numComments: opportunity.num_comments,
    createdUtc: opportunity.created_utc,
    ageHours: opportunity.age_hours,
    url: opportunity.url,
    hotScore: opportunity.hot_score,
    signals: opportunity.signals,
    matchReason: opportunity.match_reason,
  };
}

function buildHeuristicAnalysis(snapshot) {
  const opportunities = identifySyncHotLeads(snapshot?.posts || []).map(mapHeuristicOpportunity);
  return {
    snapshotId: snapshot.snapshotId,
    scopeId: snapshot.scopeId,
    workspaceId: snapshot.scopeId,
    status: 'heuristic_only',
    source: 'heuristic',
    jobId: null,
    opportunities,
    opportunityCount: opportunities.length,
    totalPosts: snapshot?.posts?.length || 0,
    heuristicGeneratedAt: new Date().toISOString(),
    completedAt: null,
    failedCount: 0,
  };
}

async function resolveWorkspace({ workspaceId = null, token = '', now = Date.now() } = {}) {
  const trimmedToken = String(token || '').trim();
  if (workspaceId) {
    const workspace = await getWorkspace(workspaceId);
    if (workspace) {
      return {
        workspace,
        workspaceId: workspace.workspaceId,
        token: trimmedToken || workspace.sourceSyncToken || '',
      };
    }
    if (!trimmedToken) {
      return { workspace: null, workspaceId, token: '' };
    }
  }

  if (!trimmedToken) {
    return { workspace: null, workspaceId: workspaceId || null, token: '' };
  }

  let workspace = await getWorkspaceByToken(trimmedToken);
  if (!workspace) {
    const legacyScopeId = buildScopeId(trimmedToken);
    const legacyConfig = await getAgentConfig(legacyScopeId);
    const legacySnapshot = await getLatestAgentSnapshot(legacyScopeId);
    workspace = await ensureWorkspaceForToken(trimmedToken, {
      now,
      legacyScopeId: legacyConfig || legacySnapshot ? legacyScopeId : null,
    });
  }

  return {
    workspace,
    workspaceId: workspace?.workspaceId || workspaceId || buildScopeId(trimmedToken),
    token: trimmedToken,
  };
}

async function getWorkspaceContext({
  workspaceId = null,
  token = '',
  now = Date.now(),
  deriveConfigFromSync = true,
} = {}) {
  const resolved = await resolveWorkspace({ workspaceId, token, now });
  const sourceToken = resolved.token || resolved.workspace?.sourceSyncToken || '';
  const effectiveWorkspaceId = resolved.workspaceId;

  if (!effectiveWorkspaceId) {
    return {
      workspaceId: null,
      workspace: null,
      snapshot: null,
      config: null,
      analysis: null,
      syncRecord: null,
      token: sourceToken,
    };
  }

  const syncRecord = sourceToken ? await storage.get(sourceToken) : null;
  let snapshot = await getLatestAgentSnapshot(effectiveWorkspaceId);
  if (syncRecord && sourceToken) {
    snapshot = await materializeAgentSnapshot(sourceToken, syncRecord, {
      now,
      scopeId: effectiveWorkspaceId,
    });
  }

  let config = await getAgentConfig(effectiveWorkspaceId);
  if (!config && syncRecord && deriveConfigFromSync) {
    config = deriveAgentConfigFromSync(effectiveWorkspaceId, sourceToken, syncRecord, now);
  }

  let analysis = snapshot ? await getAgentAnalysis(snapshot.snapshotId) : null;
  if (snapshot && !analysis) {
    analysis = buildHeuristicAnalysis(snapshot);
    await saveAgentAnalysis(snapshot.snapshotId, analysis, { expiresAt: snapshot.expiresAt });
  }

  return {
    workspaceId: effectiveWorkspaceId,
    workspace: resolved.workspace || null,
    snapshot,
    config,
    analysis,
    syncRecord,
    token: sourceToken,
  };
}

async function materializeWorkspaceFromSync({
  workspaceId = null,
  token = '',
  syncRecord = null,
  now = Date.now(),
  deriveConfigFromSync = true,
} = {}) {
  const resolved = await resolveWorkspace({ workspaceId, token, now });
  const sourceToken = resolved.token || resolved.workspace?.sourceSyncToken || '';
  const effectiveWorkspaceId = resolved.workspaceId;
  const effectiveSyncRecord = syncRecord || (sourceToken ? await storage.get(sourceToken) : null);

  if (!effectiveWorkspaceId || !effectiveSyncRecord || !sourceToken) {
    return {
      workspaceId: effectiveWorkspaceId || null,
      workspace: resolved.workspace || null,
      snapshot: null,
      config: null,
      syncRecord: effectiveSyncRecord,
      token: sourceToken,
    };
  }

  const snapshot = await materializeAgentSnapshot(sourceToken, effectiveSyncRecord, {
    now,
    scopeId: effectiveWorkspaceId,
  });

  let config = await getAgentConfig(effectiveWorkspaceId);
  if (!config && deriveConfigFromSync) {
    config = deriveAgentConfigFromSync(effectiveWorkspaceId, sourceToken, effectiveSyncRecord, now);
    await saveAgentConfig(effectiveWorkspaceId, config);
  }

  return {
    workspaceId: effectiveWorkspaceId,
    workspace: resolved.workspace || null,
    snapshot,
    config,
    syncRecord: effectiveSyncRecord,
    token: sourceToken,
  };
}

async function upsertWorkspaceSnapshot({
  workspaceId = null,
  token = '',
  posts = [],
  settings = {},
  filters = {},
  timestamp = null,
  now = Date.now(),
  deriveConfigFromSync = true,
} = {}) {
  const resolved = await resolveWorkspace({ workspaceId, token, now });
  const effectiveWorkspaceId = resolved.workspaceId || workspaceId || null;
  const effectiveToken = String(token || resolved.workspace?.sourceSyncToken || '').trim();
  let workspace = resolved.workspace || null;

  if (workspace) {
    workspace = await saveWorkspace({
      ...workspace,
      sourceSyncToken: effectiveToken || workspace.sourceSyncToken || '',
      updatedAt: new Date(now).toISOString(),
    });
  }

  if (effectiveToken) {
    const syncRecord = await saveSyncRecord(effectiveToken, {
      posts,
      settings,
      filters,
      timestamp,
    }, { now });
    const materialized = await materializeWorkspaceFromSync({
      workspaceId: effectiveWorkspaceId,
      token: effectiveToken,
      syncRecord,
      now,
      deriveConfigFromSync,
    });
    return {
      ...materialized,
      source: 'sync_record',
    };
  }

  if (!effectiveWorkspaceId) {
    return {
      workspaceId: null,
      workspace,
      snapshot: null,
      config: null,
      syncRecord: null,
      token: '',
      source: 'direct',
    };
  }

  const syntheticSyncRecord = buildSyncRecord({
    token: '',
    posts,
    settings,
    filters,
    timestamp,
    now,
  });
  const snapshot = await saveAgentSnapshot(createAgentSnapshot({
    scopeId: effectiveWorkspaceId,
    sourceSyncToken: '',
    sourceSyncedAt: syntheticSyncRecord.syncedAt,
    timestamp: syntheticSyncRecord.timestamp,
    posts,
    filters,
    now,
    ttlSeconds: DEFAULT_SNAPSHOT_TTL_SECONDS,
  }));

  let config = await getAgentConfig(effectiveWorkspaceId);
  if (!config && deriveConfigFromSync && settings && Object.keys(settings).length > 0) {
    config = deriveAgentConfigFromSync(effectiveWorkspaceId, '', syntheticSyncRecord, now);
    await saveAgentConfig(effectiveWorkspaceId, config);
  }

  return {
    workspaceId: effectiveWorkspaceId,
    workspace,
    snapshot,
    config,
    syncRecord: null,
    token: '',
    source: 'direct',
  };
}

module.exports = {
  mapHeuristicOpportunity,
  buildHeuristicAnalysis,
  resolveWorkspace,
  getWorkspaceContext,
  materializeWorkspaceFromSync,
  upsertWorkspaceSnapshot,
};
