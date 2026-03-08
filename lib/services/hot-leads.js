const MAX_LEAD_AGE_HOURS = 48;
const MIN_AI_RELEVANCE = 4;
const KEYWORD_FALLBACK_SCORE = 16;

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

function identifySyncHotLeads(posts) {
  const hotLeads = [];
  const nowSeconds = Date.now() / 1000;

  for (const post of posts) {
    const { ageHours, matchedIntent, matchedService } = getKeywordSignals(post, nowSeconds);
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

    if (post.aiRelevance >= 4) {
      score += 5;
      signals.push(`AI relevance: ${post.aiRelevance}/5`);
    }

    if (score >= 8) {
      hotLeads.push({
        id: post.id,
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        age_hours: Math.round(ageHours * 10) / 10,
        url: post.reddit_url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
        hot_score: score,
        signals: signals.slice(0, 4),
        match_reason: matchedIntent.length > 0
          ? `Intent detected + ${matchedService.length > 0 ? 'service match' : 'engagement'}`
          : matchedService.length > 0
            ? 'Service relevance + engagement'
            : 'High engagement velocity',
      });
    }
  }

  hotLeads.sort((a, b) => b.hot_score - a.hot_score);
  return hotLeads.slice(0, 20);
}

function identifyPollerHotLeads(posts) {
  const hotLeads = [];
  const nowSeconds = Date.now() / 1000;

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

    const aiRelevance = post.aiRelevance;
    const aiWorked = aiRelevance !== null && !post.aiRankingFailed;
    let isHotLead = false;

    if (aiWorked) {
      if (aiRelevance >= MIN_AI_RELEVANCE) {
        isHotLead = true;
        signals.unshift(`AI score: ${aiRelevance}/5`);
      }
    } else if (keywordScore >= KEYWORD_FALLBACK_SCORE) {
      isHotLead = true;
      signals.unshift('keyword-only (AI unavailable)');
    }

    if (isHotLead) {
      hotLeads.push({
        id: post.id,
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        age_hours: Math.round(ageHours * 10) / 10,
        url: post.reddit_url,
        aiRelevance,
        aiRankingAvailable: aiWorked,
        hot_score: keywordScore,
        signals: signals.slice(0, 4),
      });
    }
  }

  return hotLeads.sort((a, b) => {
    const aiDiff = (b.aiRelevance || 0) - (a.aiRelevance || 0);
    if (Math.abs(aiDiff) > 0.1) return aiDiff;
    return a.age_hours - b.age_hours;
  });
}

module.exports = {
  identifySyncHotLeads,
  identifyPollerHotLeads,
};
