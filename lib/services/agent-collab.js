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

function buildAiOpportunities(posts, threshold = 4) {
  const priorityThreshold = Math.max(0, Math.min(1, Number(threshold) / 5 || 0.8));
  return (posts || [])
    .filter((post) => {
      const priority = post.aiOpportunity?.scores?.priority ?? post.aiPriority ?? null;
      if (priority !== null && priority !== undefined) return Number(priority) >= priorityThreshold;
      return Number(post.aiScoreProxy) >= threshold;
    })
    .map((post) => ({
      postId: String(post.id),
      title: post.title,
      subreddit: post.subreddit,
      score: post.score,
      numComments: post.num_comments,
      createdUtc: post.created_utc,
      url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
      hotScore: Number(post.aiOpportunity?.scores?.priority ?? post.aiPriority ?? post.aiScoreProxy ?? 0),
      signals: [
        post.aiOpportunity?.scores?.priority !== undefined && post.aiOpportunity?.scores?.priority !== null
          ? `Opportunity priority: ${Math.round(Number(post.aiOpportunity.scores.priority) * 100)}/100`
          : `Opportunity score proxy: ${post.aiScoreProxy}/5`,
        ...(post.aiOpportunity?.classification?.type ? [`type: ${post.aiOpportunity.classification.type}`] : []),
        ...(post.aiOpportunity?.action?.recommended ? [`action: ${post.aiOpportunity.action.recommended}`] : []),
        ...(post.aiMetadata?.confidence ? [`confidence: ${post.aiMetadata.confidence}`] : []),
      ].slice(0, 4),
      matchReason: post.aiOpportunity?.explanation?.summary || post.aiMetadata?.reason || `Opportunity threshold met (${threshold}/5 proxy)`,
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
  mapHeuristicOpportunity,
  buildHeuristicAnalysis,
  buildAiOpportunities,
  getOrMaterializeAgentContext,
};
