const MAX_LEAD_AGE_HOURS = 48;
const MIN_AI_RELEVANCE = 4;
const KEYWORD_FALLBACK_SCORE = 16;
const MIN_OPPORTUNITY_PRIORITY = 0.65;

const INTENT_KEYWORDS = [
  'looking for', 'need', 'seeking', 'want', 'hire', 'budget',
  'pay', 'recommend', 'suggestion', 'help with', 'struggling',
  'frustrated', 'urgent', 'asap', 'deadline',
];

const SERVICE_KEYWORDS = [
  'seo', 'search', 'ranking', 'google', 'traffic', 'visibility',
  'optimization', 'content', 'marketing', 'agency', 'consultant',
  'expert', 'advice', 'strategy', 'audit', 'keywords',
];

function getKeywordSignals(post, nowSeconds) {
  const title = (post.title || '').toLowerCase();
  const selftext = (post.selftext || '').toLowerCase();
  const combined = `${title} ${selftext}`;
  const ageHours = (nowSeconds - (post.created_utc || 0)) / 3600;
  const matchedIntent = INTENT_KEYWORDS.filter((kw) => combined.includes(kw));
  const matchedService = SERVICE_KEYWORDS.filter((kw) => combined.includes(kw));

  return {
    ageHours,
    matchedIntent,
    matchedService,
  };
}

function getOpportunityRecord(post = {}) {
  if (post.aiOpportunity && typeof post.aiOpportunity === 'object') return post.aiOpportunity;
  return null;
}

function getOpportunityPriority(post = {}) {
  const opportunity = getOpportunityRecord(post);
  if (opportunity?.scores?.priority !== undefined && opportunity?.scores?.priority !== null) {
    return Math.max(0, Math.min(1, Number(opportunity.scores.priority) || 0));
  }
  if (post.aiPriority !== undefined && post.aiPriority !== null) {
    return Math.max(0, Math.min(1, Number(post.aiPriority) || 0));
  }
  if (post.aiScoreProxy !== undefined && post.aiScoreProxy !== null) {
    return Math.max(0, Math.min(1, (Number(post.aiScoreProxy) || 0) / 5));
  }
  return null;
}

function getOpportunityType(post = {}) {
  return getOpportunityRecord(post)?.classification?.type || null;
}

function getRecommendedAction(post = {}) {
  return getOpportunityRecord(post)?.action?.recommended || null;
}

function getPriorityThreshold(settings = {}) {
  const configured = Number(settings.aiThreshold);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.max(0, Math.min(1, configured / 5));
  }
  return MIN_OPPORTUNITY_PRIORITY;
}

function buildOpportunitySignals(post, priority, matchedIntent, matchedService, fallbackLabel) {
  const signals = [];
  const type = getOpportunityType(post);
  const action = getRecommendedAction(post);

  if (fallbackLabel) signals.push(fallbackLabel);
  if (priority !== null) signals.push(`priority: ${Math.round(priority * 100)}/100`);
  if (type) signals.push(`type: ${String(type).replace(/_/g, ' ')}`);
  if (action) signals.push(`action: ${String(action).replace(/_/g, ' ')}`);
  if (matchedIntent.length > 0) signals.push(`intent: ${matchedIntent.slice(0, 2).join(', ')}`);
  if (matchedService.length > 0) signals.push(`service: ${matchedService.slice(0, 2).join(', ')}`);

  return signals.slice(0, 4);
}

function identifySyncHotLeads(posts, settings = {}) {
  const opportunities = [];
  const nowSeconds = Date.now() / 1000;
  const priorityThreshold = getPriorityThreshold(settings);

  for (const post of posts) {
    const { ageHours, matchedIntent, matchedService } = getKeywordSignals(post, nowSeconds);
    const priority = getOpportunityPriority(post);
    let score = 0;
    const signals = [];

    if (matchedIntent.length > 0) {
      score += matchedIntent.length * 2;
      signals.push(`intent: ${matchedIntent.slice(0, 2).join(', ')}`);
    }

    if (matchedService.length > 0) {
      score += matchedService.length * 3;
      signals.push(`service match: ${matchedService.slice(0, 2).join(', ')}`);
    }

    if (ageHours < 24) {
      score += 5;
      signals.push('fresh (< 24h)');
    } else if (ageHours < 48) {
      score += 2;
      signals.push('recent (< 48h)');
    }

    if (ageHours > 0) {
      const upvotesPerHour = (post.score || 0) / ageHours;
      const commentsPerHour = (post.num_comments || 0) / ageHours;

      if (upvotesPerHour > 10) {
        score += 3;
        signals.push('high upvote velocity');
      }
      if (commentsPerHour > 2) {
        score += 3;
        signals.push('active discussion');
      }
    }

    if (post.score > 50) score += 2;
    if (post.num_comments > 10) score += 2;

    if (priority !== null && priority >= priorityThreshold) {
      score += 6;
      signals.push(`priority: ${Math.round(priority * 100)}/100`);
    }

    if (score >= 8 || (priority !== null && priority >= priorityThreshold)) {
      const opportunityType = getOpportunityType(post);
      const recommendedAction = getRecommendedAction(post);
      opportunities.push({
        id: post.id,
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        age_hours: Math.round(ageHours * 10) / 10,
        url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
        hot_score: score,
        opportunity_priority: priority,
        opportunity_type: opportunityType,
        recommended_action: recommendedAction,
        signals: buildOpportunitySignals(post, priority, matchedIntent, matchedService) || signals.slice(0, 4),
        match_reason: opportunityType
          ? `Opportunity classified as ${String(opportunityType).replace(/_/g, ' ')}`
          : matchedIntent.length > 0
            ? `Intent detected + ${matchedService.length > 0 ? 'service match' : 'engagement'}`
            : matchedService.length > 0
              ? 'Service relevance + engagement'
              : 'High engagement velocity',
      });
    }
  }

  opportunities.sort((a, b) => {
    const priorityDiff = (b.opportunity_priority || 0) - (a.opportunity_priority || 0);
    if (Math.abs(priorityDiff) > 0.01) return priorityDiff;
    return b.hot_score - a.hot_score;
  });
  return opportunities.slice(0, 20);
}

function identifyPollerHotLeads(posts, settings = {}) {
  const opportunities = [];
  const nowSeconds = Date.now() / 1000;
  const priorityThreshold = getPriorityThreshold(settings);

  for (const post of posts) {
    const { ageHours, matchedIntent, matchedService } = getKeywordSignals(post, nowSeconds);
    if (ageHours > MAX_LEAD_AGE_HOURS) continue;

    let keywordScore = 0;
    const signals = [];

    if (matchedIntent.length > 0) {
      keywordScore += matchedIntent.length * 2;
      signals.push(`intent: ${matchedIntent.slice(0, 2).join(', ')}`);
    }

    if (matchedService.length > 0) {
      keywordScore += matchedService.length * 2;
      signals.push(`service: ${matchedService.slice(0, 2).join(', ')}`);
    }

    if (ageHours < 24) {
      keywordScore += 4;
      signals.push('fresh (<24h)');
    } else {
      keywordScore += 2;
      signals.push('recent (<48h)');
    }

    if (post.score > 20) keywordScore += 2;
    if (post.num_comments > 5) keywordScore += 2;

    const scoreProxy = post.aiScoreProxy;
    const priority = getOpportunityPriority(post);
    const aiWorked = (priority !== null || scoreProxy !== null) && !post.aiRankingFailed;
    let isOpportunity = false;

    if (aiWorked) {
      if ((priority !== null && priority >= priorityThreshold) || scoreProxy >= MIN_AI_RELEVANCE) {
        isOpportunity = true;
        signals.unshift(priority !== null
          ? `priority: ${Math.round(priority * 100)}/100`
          : `score proxy: ${scoreProxy}/5`);
      }
    } else if (keywordScore >= KEYWORD_FALLBACK_SCORE) {
      isOpportunity = true;
      signals.unshift('keyword-only (opportunity engine unavailable)');
    }

    if (isOpportunity) {
      const opportunityType = getOpportunityType(post);
      const recommendedAction = getRecommendedAction(post);
      opportunities.push({
        id: post.id,
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        age_hours: Math.round(ageHours * 10) / 10,
        url: post.reddit_url,
        aiScoreProxy: scoreProxy,
        aiPriority: priority,
        opportunityType,
        recommendedAction,
        aiRankingAvailable: aiWorked,
        hot_score: keywordScore,
        signals: buildOpportunitySignals(
          post,
          priority,
          matchedIntent,
          matchedService,
          aiWorked ? null : 'keyword-only (opportunity engine unavailable)'
        ),
      });
    }
  }

  return opportunities.sort((a, b) => {
    const priorityDiff = (b.aiPriority || 0) - (a.aiPriority || 0);
    if (Math.abs(priorityDiff) > 0.01) return priorityDiff;
    const aiDiff = (b.aiScoreProxy || 0) - (a.aiScoreProxy || 0);
    if (Math.abs(aiDiff) > 0.1) return aiDiff;
    return a.age_hours - b.age_hours;
  });
}

module.exports = {
  identifySyncHotLeads,
  identifyPollerHotLeads,
};
