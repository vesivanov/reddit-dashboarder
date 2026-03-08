const storage = require('../storage');
const { identifySyncHotLeads } = require('./hot-leads');
const {
  buildScopeId,
  getAgentConfig,
  deriveAgentConfigFromSync,
} = require('../repos/agent-configs');
const {
  getLatestAgentSnapshot,
  materializeAgentSnapshot,
} = require('../repos/agent-snapshots');
const {
  getAgentAnalysis,
  saveAgentAnalysis,
} = require('../repos/agent-analyses');
const {
  getWorkspaceByToken,
  ensureWorkspaceForToken,
} = require('../repos/agent-workspaces');

function mapHeuristicLead(lead) {
  return {
    postId: lead.id,
    title: lead.title,
    subreddit: lead.subreddit,
    score: lead.score,
    numComments: lead.num_comments,
    createdUtc: lead.created_utc,
    ageHours: lead.age_hours,
    url: lead.url,
    hotScore: lead.hot_score,
    signals: lead.signals,
    matchReason: lead.match_reason,
  };
}

function buildHeuristicAnalysis(snapshot) {
  const hotLeads = identifySyncHotLeads(snapshot?.posts || []).map(mapHeuristicLead);
  return {
    snapshotId: snapshot.snapshotId,
    scopeId: snapshot.scopeId,
    status: 'heuristic_only',
    source: 'heuristic',
    jobId: null,
    hotLeads,
    hotLeadCount: hotLeads.length,
    totalPosts: snapshot?.posts?.length || 0,
    heuristicGeneratedAt: new Date().toISOString(),
    completedAt: null,
    failedCount: 0,
  };
}

function buildAiHotLeads(posts, threshold = 4) {
  return (posts || [])
    .filter((post) => Number(post.aiRelevance) >= threshold)
    .map((post) => ({
      postId: String(post.id),
      title: post.title,
      subreddit: post.subreddit,
      score: post.score,
      numComments: post.num_comments,
      createdUtc: post.created_utc,
      url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
      hotScore: Number(post.aiRelevance),
      signals: [
        `AI relevance: ${post.aiRelevance}/5`,
        ...(post.aiMetadata?.confidence ? [`confidence: ${post.aiMetadata.confidence}`] : []),
      ],
      matchReason: post.aiMetadata?.reason || `AI relevance met threshold ${threshold}`,
    }));
}

async function getOrMaterializeAgentContext(token, {
  now = Date.now(),
  deriveConfigFromSync = true,
} = {}) {
  if (!token) {
    return {
      scopeId: null,
      snapshot: null,
      config: null,
      analysis: null,
      syncRecord: null,
    };
  }

  const legacyScopeId = buildScopeId(token);
  let workspace = await getWorkspaceByToken(token);
  if (!workspace) {
    const legacyConfig = await getAgentConfig(legacyScopeId);
    const legacySnapshot = await getLatestAgentSnapshot(legacyScopeId);
    workspace = await ensureWorkspaceForToken(token, {
      now,
      legacyScopeId: legacyConfig || legacySnapshot ? legacyScopeId : null,
    });
  }
  const scopeId = workspace?.workspaceId || legacyScopeId;
  const syncRecord = await storage.get(token);

  let snapshot = await getLatestAgentSnapshot(scopeId);
  if (syncRecord) {
    snapshot = await materializeAgentSnapshot(token, syncRecord, { now, scopeId });
  }

  let config = await getAgentConfig(scopeId);
  if (!config && syncRecord && deriveConfigFromSync) {
    config = deriveAgentConfigFromSync(scopeId, token, syncRecord, now);
  }

  let analysis = snapshot ? await getAgentAnalysis(snapshot.snapshotId) : null;
  if (snapshot && !analysis) {
    analysis = buildHeuristicAnalysis(snapshot);
    await saveAgentAnalysis(snapshot.snapshotId, analysis, { expiresAt: snapshot.expiresAt });
  }

  return {
    scopeId,
    workspace,
    snapshot,
    config,
    analysis,
    syncRecord,
  };
}

module.exports = {
  mapHeuristicLead,
  buildHeuristicAnalysis,
  buildAiHotLeads,
  getOrMaterializeAgentContext,
};
