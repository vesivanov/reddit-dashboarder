(function init(globalScope) {
  const STOP_WORDS = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'have', 'has']);

  function extractGoalKeywords(goalsText) {
    if (!goalsText) return [];
    const words = goalsText
      .toLowerCase()
      .split(/[\s,;.!?()]+/)
      .filter(Boolean)
      .filter(word => word.length >= 3)
      .filter(word => !STOP_WORDS.has(word));
    return [...new Set(words)].slice(0, 20);
  }

  function computeHeuristicScore(post = {}, keywords = []) {
    if (!Array.isArray(keywords) || keywords.length === 0) return 0;
    const title = (post.title || '').toLowerCase();
    const selftext = (post.selftext || '').toLowerCase();
    const subreddit = (post.subreddit || '').toLowerCase();
    const domain = post.domain || '';

    let score = 0;
    keywords.forEach(kw => {
      if (title.includes(kw)) score += 3;
    });
    keywords.forEach(kw => {
      if (selftext.includes(kw)) score += 1;
    });
    keywords.forEach(kw => {
      if (subreddit.includes(kw)) score += 2;
    });

    if (domain && !domain.includes('reddit')) {
      score += 0.5;
    }

    const upvotes = Number(post.score) || 0;
    const comments = Number(post.num_comments) || 0;
    if (upvotes > 100) score += 1;
    if (upvotes > 500) score += 1;
    if (comments > 20) score += 1;
    if (comments > 50) score += 1;

    return score;
  }

  function calibrateScores(scoresMap) {
    if (!scoresMap || typeof scoresMap.size !== 'number' || scoresMap.size === 0) {
      return scoresMap;
    }

    const entries = Array.from(scoresMap.entries()).filter(([, score]) => score !== null && score !== undefined);
    if (entries.length === 0) return scoresMap;

    if (entries.length === 1) {
      const calibrated = new Map();
      calibrated.set(entries[0][0], 5);
      scoresMap.forEach((score, postId) => {
        if (score === null || score === undefined) {
          calibrated.set(postId, score);
        }
      });
      return calibrated;
    }

    entries.sort((a, b) => b[1] - a[1]);
    const calibrated = new Map();
    entries.forEach(([postId], index) => {
      const percentile = (entries.length - index - 1) / (entries.length - 1);
      let calibratedScore;
      if (percentile >= 0.9) {
        calibratedScore = 5;
      } else if (percentile >= 0.7) {
        calibratedScore = 4;
      } else if (percentile >= 0.4) {
        calibratedScore = 3;
      } else if (percentile >= 0.2) {
        calibratedScore = 2;
      } else if (percentile >= 0.05) {
        calibratedScore = 1;
      } else {
        calibratedScore = 0;
      }
      calibrated.set(postId, calibratedScore);
    });

    scoresMap.forEach((score, postId) => {
      if (score === null || score === undefined) {
        calibrated.set(postId, score);
      }
    });

    return calibrated;
  }

  function getAutoRefreshPlan({ autoRefreshEnabled, subsLength, intervalMinutes, minMinutes = 5, now = Date.now() }) {
    if (!autoRefreshEnabled || !subsLength) {
      return { shouldSchedule: false, intervalMs: null, nextRefreshAt: null };
    }
    // Validate and normalize intervalMinutes: ensure it's a positive number
    const parsed = Number(intervalMinutes);
    const normalizedMinutes = Math.max(minMinutes, (isNaN(parsed) || parsed <= 0) ? minMinutes : parsed);
    const intervalMs = normalizedMinutes * 60 * 1000;
    return {
      shouldSchedule: true,
      intervalMs,
      nextRefreshAt: now + intervalMs,
    };
  }

  const helpers = {
    extractGoalKeywords,
    computeHeuristicScore,
    calibrateScores,
    getAutoRefreshPlan,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = helpers;
  }

  if (globalScope) {
    globalScope.RDDHelpers = Object.assign({}, globalScope.RDDHelpers, helpers);
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
