const {
  mapHeuristicOpportunity,
  buildHeuristicAnalysis,
  getWorkspaceContext,
} = require('./workspace-service');

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
  const context = await getWorkspaceContext({
    token,
    now,
    deriveConfigFromSync,
  });
  return {
    scopeId: context.workspaceId,
    workspaceId: context.workspaceId,
    workspace: context.workspace,
    snapshot: context.snapshot,
    config: context.config,
    analysis: context.analysis,
    syncRecord: context.syncRecord,
  };
}

module.exports = {
  mapHeuristicOpportunity,
  buildHeuristicAnalysis,
  buildAiOpportunities,
  getOrMaterializeAgentContext,
};
