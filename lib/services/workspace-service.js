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
  createAgentSnapshotFromSync,
  getLatestAgentSnapshot,
  saveAgentSnapshot,
} = require('../repos/agent-snapshots');
const {
  getAgentAnalysis,
} = require('../repos/agent-analyses');
const {
  getWorkspace,
  getWorkspaceByToken,
  ensureWorkspaceForToken,
  saveWorkspace,
} = require('../repos/agent-workspaces');
const { getCoverageBundle } = require('../repos/reddit-coverage');
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

function materializeCoveragePosts(bundle) {
  const postsBySubreddit = bundle?.postsBySubreddit || {};
  const deduped = new Map();

  Object.values(postsBySubreddit).forEach((posts) => {
    if (!Array.isArray(posts)) return;
    posts.forEach((post) => {
      if (!post?.id) return;
      deduped.set(String(post.id), post);
    });
  });

  return Array.from(deduped.values()).sort((a, b) => (Number(b.created_utc) || 0) - (Number(a.created_utc) || 0));
}

function isStorageCapacityError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('oom command not allowed')
    || message.includes('maxmemory')
    || message.includes('out of memory')
    || error?.status === 507
    || error?.statusCode === 507
  );
}

function buildEphemeralSnapshot({ token, syncRecord, scopeId, now }) {
  return createAgentSnapshotFromSync(token, syncRecord, now, scopeId);
}

async function persistConfigWithFallback(scopeId, config) {
  try {
    await saveAgentConfig(scopeId, config);
  } catch (error) {
    if (!isStorageCapacityError(error)) {
      throw error;
    }
    console.warn('[workspace-service] Config persistence skipped due to storage capacity:', error.message);
  }
}

async function resolveSyncRecordMaterialization(syncRecord) {
  if (!syncRecord || !syncRecord.source || typeof syncRecord.source !== 'object') {
    return { syncRecord, sourceUnavailable: false };
  }

  if (syncRecord.source.type !== 'reddit_coverage') {
    return { syncRecord, sourceUnavailable: false };
  }

  const coverageScopeId = String(syncRecord.source.coverageScopeId || '').trim();
  if (!coverageScopeId) {
    return { syncRecord, sourceUnavailable: true };
  }

  const bundle = await getCoverageBundle(coverageScopeId);
  if (!bundle) {
    return { syncRecord, sourceUnavailable: true };
  }

  return {
    syncRecord: {
      ...syncRecord,
      posts: materializeCoveragePosts(bundle),
    },
    sourceUnavailable: false,
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

  const rawSyncRecord = sourceToken ? await storage.get(sourceToken) : null;
  const { syncRecord, sourceUnavailable } = await resolveSyncRecordMaterialization(rawSyncRecord);
  if (syncRecord && sourceToken && !sourceUnavailable) {
    const snapshot = buildEphemeralSnapshot({
      token: sourceToken,
      syncRecord,
      scopeId: effectiveWorkspaceId,
      now,
    });

    let config = await getAgentConfig(effectiveWorkspaceId);
    if (!config && deriveConfigFromSync) {
      config = deriveAgentConfigFromSync(effectiveWorkspaceId, sourceToken, syncRecord, now);
    }

    let analysis = await getAgentAnalysis(snapshot.snapshotId);
    if (!analysis) {
      analysis = buildHeuristicAnalysis(snapshot);
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

  const snapshot = await getLatestAgentSnapshot(effectiveWorkspaceId);
  let config = await getAgentConfig(effectiveWorkspaceId);
  let analysis = snapshot ? await getAgentAnalysis(snapshot.snapshotId) : null;
  if (snapshot && !analysis) {
    analysis = buildHeuristicAnalysis(snapshot);
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
  const storedSyncRecord = syncRecord || (sourceToken ? await storage.get(sourceToken) : null);
  const { syncRecord: effectiveSyncRecord, sourceUnavailable } = await resolveSyncRecordMaterialization(storedSyncRecord);

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

  let snapshot = await getLatestAgentSnapshot(effectiveWorkspaceId);
  if (!sourceUnavailable) {
    snapshot = buildEphemeralSnapshot({
      token: sourceToken,
      syncRecord: effectiveSyncRecord,
      now,
      scopeId: effectiveWorkspaceId,
    });
  }

  let config = await getAgentConfig(effectiveWorkspaceId);
  if (!config && deriveConfigFromSync) {
    config = deriveAgentConfigFromSync(effectiveWorkspaceId, sourceToken, effectiveSyncRecord, now);
    await persistConfigWithFallback(effectiveWorkspaceId, config);
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
  source = null,
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
    if (source && source.type === 'reddit_coverage') {
      const coverageScopeId = String(source.coverageScopeId || '').trim();
      const coverageBundle = coverageScopeId ? await getCoverageBundle(coverageScopeId) : null;
      if (!coverageScopeId || !coverageBundle) {
        const error = new Error('Workspace snapshot source coverage is unavailable');
        error.status = 404;
        throw error;
      }
    }
    const syncRecord = await saveSyncRecord(effectiveToken, {
      posts,
      settings,
      filters,
      timestamp,
      source,
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
    extra: source ? { source } : {},
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
