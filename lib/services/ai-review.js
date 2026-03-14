const STOP_WORDS = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'have', 'has']);
const { buildOpportunityRecord } = require('./opportunity-engine');
const BUYER_INTENT_PATTERNS = [
  /\bneed help\b/i,
  /\bneed someone\b/i,
  /\blooking for\b/i,
  /\brecommend(?:ation|ations)?\b/i,
  /\bwhich tool\b/i,
  /\bbest tool\b/i,
  /\bbest software\b/i,
  /\bbest agency\b/i,
  /\bbest consultant\b/i,
  /\bvendor\b/i,
  /\bservice\b/i,
  /\bsolution\b/i,
  /\bplatform\b/i,
  /\bsoftware\b/i,
  /\bagency\b/i,
  /\bconsultant\b/i,
  /\bfreelancer\b/i,
  /\bhire\b/i,
  /\bevaluat(?:e|ing)\b/i,
  /\bcompare\b/i,
];
const AUTHORITY_PATTERNS = [
  /\bour (?:team|company|business|store|agency|startup|brand)\b/i,
  /\bwe (?:need|are|have|run|sell|manage|launched?)\b/i,
  /\bmy (?:company|business|startup|store|agency|team|clients?)\b/i,
  /\bclient(?:s)?\b/i,
  /\bcustomer(?:s)?\b/i,
  /\brevenue\b/i,
  /\bpipeline\b/i,
  /\bfounder\b/i,
  /\bowner\b/i,
  /\bmanager\b/i,
  /\bdirector\b/i,
  /\bmarketing team\b/i,
];
const URGENCY_PATTERNS = [
  /\basap\b/i,
  /\burgent\b/i,
  /\bright now\b/i,
  /\bthis week\b/i,
  /\bthis month\b/i,
  /\bsoon\b/i,
  /\bimmediately\b/i,
  /\bdeadline\b/i,
  /\blaunch(?:ing|ed)?\b/i,
  /\bship(?:ping|ped)?\b/i,
];
const PAIN_PATTERNS = [
  /\bstruggl(?:e|ing)\b/i,
  /\bnot working\b/i,
  /\bstuck\b/i,
  /\bproblem\b/i,
  /\bissue\b/i,
  /\bdrop(?:ped|ping)?\b/i,
  /\bdeclin(?:e|ing)\b/i,
  /\blost\b/i,
  /\bunderperform(?:ing)?\b/i,
  /\bfail(?:ing|ed)?\b/i,
  /\bcan(?:not|'t)\b/i,
  /\bneed to improve\b/i,
];
const SOLUTION_SEARCH_PATTERNS = [
  /\btool\b/i,
  /\bsoftware\b/i,
  /\bplatform\b/i,
  /\bagency\b/i,
  /\bconsultant\b/i,
  /\bservice\b/i,
  /\bvendor\b/i,
  /\bprovider\b/i,
  /\balternative\b/i,
  /\bswitch(?:ing)?\b/i,
  /\bmigration\b/i,
];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeLog(value, scale) {
  const normalizedValue = Math.max(0, Number(value) || 0);
  const normalizedScale = Math.max(1, Number(scale) || 1);
  return clamp01(Math.log1p(normalizedValue) / Math.log1p(normalizedScale));
}

function countMatches(text, patterns) {
  const source = String(text || '');
  if (!source) return 0;
  return patterns.reduce((count, pattern) => count + (pattern.test(source) ? 1 : 0), 0);
}

function signalFromMatches(text, patterns, fullSignalAt = 3) {
  return clamp01(countMatches(text, patterns) / Math.max(1, fullSignalAt));
}

function getAgeHours(post = {}) {
  const createdUtc = Number(post.created_utc);
  if (!Number.isFinite(createdUtc) || createdUtc <= 0) return 999;
  return Math.max(0, (Date.now() / 1000 - createdUtc) / 3600);
}

function sortEntriesBy(entries, scoreSelector) {
  return entries.slice().sort((left, right) => {
    const scoreDelta = (Number(scoreSelector(right)) || 0) - (Number(scoreSelector(left)) || 0);
    if (scoreDelta !== 0) return scoreDelta;
    const createdDelta = (Number(right.post?.created_utc) || 0) - (Number(left.post?.created_utc) || 0);
    if (createdDelta !== 0) return createdDelta;
    const commentsDelta = (Number(right.post?.num_comments) || 0) - (Number(left.post?.num_comments) || 0);
    if (commentsDelta !== 0) return commentsDelta;
    return (Number(right.post?.score) || 0) - (Number(left.post?.score) || 0);
  });
}

function tokenize(text) {
  if (!text) return [];
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((word) => word.length >= 3)
    .filter((word) => !STOP_WORDS.has(word));
}

function tokensWithBigrams(text) {
  const tokens = tokenize(text);
  if (tokens.length < 2) return { tokens, set: new Set(tokens) };
  const bigrams = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return { tokens, set: new Set(tokens.concat(bigrams)) };
}

function extractGoalKeywords(goalText) {
  if (!goalText) return [];
  const { set } = tokensWithBigrams(goalText);
  return Array.from(set).slice(0, 40);
}

function computeHeuristicDetails(post = {}, keywords = []) {
  const normalizedKeywords = Array.isArray(keywords) ? keywords : [];
  const titleTokens = tokensWithBigrams(post.title || '').set;
  const selftextTokens = tokensWithBigrams(post.selftext || '').set;
  const subredditTokens = tokensWithBigrams(post.subreddit || '').set;
  const domain = String(post.domain || '');
  const flair = String(post.link_flair_text || '');
  const combinedText = [post.title, post.selftext, flair].filter(Boolean).join(' ');
  const fullContextText = [post.title, post.selftext, post.subreddit, flair].filter(Boolean).join(' ');

  let score = 0;
  let keywordScore = 0;
  const matchedTitle = [];
  const matchedSelftext = [];
  const matchedSubreddit = [];

  normalizedKeywords.forEach((keyword) => {
    if (titleTokens.has(keyword)) {
      score += 3;
      keywordScore += 3;
      matchedTitle.push(keyword);
    }
  });

  normalizedKeywords.forEach((keyword) => {
    if (selftextTokens.has(keyword)) {
      score += 1;
      keywordScore += 1;
      matchedSelftext.push(keyword);
    }
  });

  normalizedKeywords.forEach((keyword) => {
    if (subredditTokens.has(keyword)) {
      score += 2;
      keywordScore += 2;
      matchedSubreddit.push(keyword);
    }
  });

  const upvotes = Number(post.score) || 0;
  const comments = Number(post.num_comments) || 0;
  const ageHours = getAgeHours(post);
  const safeAgeHours = Math.max(1, ageHours);
  const upvotesPerHour = upvotes / safeAgeHours;
  const commentsPerHour = comments / safeAgeHours;
  const keywordSignal = clamp01(keywordScore / 10);
  const buyerIntentSignal = signalFromMatches(fullContextText, BUYER_INTENT_PATTERNS, 3);
  const authoritySignal = signalFromMatches(fullContextText, AUTHORITY_PATTERNS, 2);
  const urgencySignal = signalFromMatches(fullContextText, URGENCY_PATTERNS, 2);
  const painSignal = signalFromMatches(fullContextText, PAIN_PATTERNS, 2);
  const solutionSearchSignal = signalFromMatches(fullContextText, SOLUTION_SEARCH_PATTERNS, 3);
  const questionSignal = combinedText.includes('?') ? 0.2 : 0;
  const freshnessScore = clamp01(1 - (ageHours / 72));
  const velocityScore = clamp01((normalizeLog(upvotesPerHour, 40) * 0.65) + (normalizeLog(commentsPerHour, 12) * 0.35));
  const engagementScore = clamp01((normalizeLog(upvotes, 500) * 0.55) + (normalizeLog(comments, 120) * 0.45));
  const domainBonus = domain && !domain.includes('reddit') ? 0.2 : 0;

  score += keywordSignal * 6;
  score += buyerIntentSignal * 5;
  score += authoritySignal * 4;
  score += urgencySignal * 2.5;
  score += painSignal * 2.5;
  score += solutionSearchSignal * 2;
  score += freshnessScore * 2;
  score += velocityScore * 2;
  score += engagementScore;
  score += questionSignal;
  score += domainBonus;

  return {
    score,
    matchedTitle,
    matchedSelftext,
    matchedSubreddit,
    keywordScore,
    keywordSignal,
    buyerIntentSignal,
    authoritySignal,
    urgencySignal,
    painSignal,
    solutionSearchSignal,
    freshnessScore,
    velocityScore,
    engagementScore,
    domainBonus,
    ageHours,
    upvotesPerHour,
    commentsPerHour,
  };
}

function normalizeHeuristicScore(heuristicScore) {
  const score = Number(heuristicScore) || 0;
  if (score >= 10) return 3;
  if (score >= 6) return 2;
  if (score >= 2.5) return 1;
  return 0;
}

function buildHeuristicOpportunity(entry, { failed = false } = {}) {
  const details = entry?.heuristicDetails || {};
  const serviceFit = clamp01((details.keywordSignal * 0.75) + (details.solutionSearchSignal * 0.15) + (details.painSignal * 0.1));
  const commercialIntent = clamp01((details.buyerIntentSignal * 0.45) + (details.authoritySignal * 0.2) + (details.urgencySignal * 0.15) + (details.painSignal * 0.1) + (details.keywordSignal * 0.1));
  const buyerSignal = clamp01((details.buyerIntentSignal * 0.45) + (details.authoritySignal * 0.35) + (details.urgencySignal * 0.2));
  const urgency = clamp01((details.urgencySignal * 0.7) + (details.freshnessScore * 0.2) + (details.velocityScore * 0.1));
  const replyability = clamp01((details.buyerIntentSignal * 0.4) + (details.freshnessScore * 0.25) + (details.velocityScore * 0.2) + (details.authoritySignal * 0.15));
  const researchValue = clamp01((details.solutionSearchSignal * 0.4) + (details.keywordSignal * 0.25) + (details.painSignal * 0.2) + ((1 - details.buyerIntentSignal) * 0.15));
  const authorityFit = clamp01((details.authoritySignal * 0.65) + (details.buyerIntentSignal * 0.2) + (details.keywordSignal * 0.15));
  const risk = clamp01(0.45 - (details.authoritySignal * 0.18) - (details.keywordSignal * 0.1) - (details.buyerIntentSignal * 0.08) + (failed ? 0.12 : 0));
  const normalizedScore = normalizeHeuristicScore(entry?.heuristicScore ?? details.score);

  return buildOpportunityRecord({
    post: entry?.post || {},
    raw: {
      score: normalizedScore,
      confidenceScore: failed ? 0.35 : 0.45,
      reason: failed
        ? 'Light review fallback based on intent, fit, freshness, and momentum.'
        : 'Light heuristic review based on intent, fit, freshness, and momentum.',
      signals: {
        commercialIntent,
        serviceFit,
        buyerSignal,
        urgency,
        replyability,
        researchValue,
        authorityFit,
        risk,
      },
    },
    metadata: {
      reason: failed
        ? 'Light review fallback based on intent, fit, freshness, and momentum.'
        : 'Light heuristic review based on intent, fit, freshness, and momentum.',
    },
  });
}

function pickExplorationEntries(entries, explorationCount) {
  if (explorationCount <= 0 || entries.length === 0) return [];
  if (explorationCount >= entries.length) return entries.slice();

  const selected = [];
  const lastIndex = entries.length - 1;

  for (let index = 0; index < explorationCount; index += 1) {
    const position = Math.round((index * lastIndex) / Math.max(1, explorationCount - 1));
    selected.push(entries[position]);
  }

  const deduped = [];
  const seenIds = new Set();
  for (const entry of selected) {
    const postId = String(entry?.post?.id || '');
    if (!postId || seenIds.has(postId)) continue;
    seenIds.add(postId);
    deduped.push(entry);
  }

  if (deduped.length >= explorationCount) return deduped.slice(0, explorationCount);

  for (const entry of entries) {
    const postId = String(entry?.post?.id || '');
    if (!postId || seenIds.has(postId)) continue;
    seenIds.add(postId);
    deduped.push(entry);
    if (deduped.length >= explorationCount) break;
  }

  return deduped;
}

function buildReviewPlan({
  posts = [],
  goalText = '',
  userContext = '',
  llmLimit = posts.length,
} = {}) {
  const combinedGoals = [goalText, userContext].filter(Boolean).join('\n');
  const keywords = extractGoalKeywords(combinedGoals);
  const entries = posts.map((post) => {
    const heuristicDetails = computeHeuristicDetails(post, keywords);
    const opportunityScore = (
      (heuristicDetails.keywordSignal * 0.27) +
      (heuristicDetails.buyerIntentSignal * 0.22) +
      (heuristicDetails.authoritySignal * 0.15) +
      (heuristicDetails.painSignal * 0.12) +
      (heuristicDetails.solutionSearchSignal * 0.08) +
      (heuristicDetails.urgencySignal * 0.06) +
      (heuristicDetails.freshnessScore * 0.05) +
      (heuristicDetails.velocityScore * 0.04) +
      (heuristicDetails.engagementScore * 0.01)
    );
    const freshnessRank = (
      (heuristicDetails.freshnessScore * 0.5) +
      (heuristicDetails.velocityScore * 0.2) +
      (heuristicDetails.buyerIntentSignal * 0.12) +
      (heuristicDetails.authoritySignal * 0.1) +
      (heuristicDetails.painSignal * 0.08)
    );
    const velocityRank = (
      (heuristicDetails.velocityScore * 0.5) +
      (heuristicDetails.engagementScore * 0.15) +
      (heuristicDetails.freshnessScore * 0.15) +
      (heuristicDetails.buyerIntentSignal * 0.1) +
      (heuristicDetails.authoritySignal * 0.1)
    );
    const lexicalRank = (
      (heuristicDetails.keywordSignal * 0.6) +
      (heuristicDetails.buyerIntentSignal * 0.15) +
      (heuristicDetails.solutionSearchSignal * 0.15) +
      (heuristicDetails.authoritySignal * 0.1)
    );
    return {
      post,
      heuristicDetails,
      heuristicScore: heuristicDetails.score,
      opportunityScore,
      freshnessRank,
      velocityRank,
      lexicalRank,
    };
  });

  const rankedEntries = sortEntriesBy(entries, (entry) => entry.opportunityScore);

  const normalizedLimit = Math.max(0, Math.min(rankedEntries.length, Math.floor(Number(llmLimit) || 0)));
  if (normalizedLimit === 0) {
    return {
      keywords,
      entries: rankedEntries,
      llmEntries: [],
      heuristicEntries: rankedEntries,
      llmPostIds: new Set(),
      entriesById: new Map(rankedEntries.map((entry) => [String(entry.post.id), entry])),
    };
  }

  if (normalizedLimit >= rankedEntries.length) {
    return {
      keywords,
      entries: rankedEntries,
      llmEntries: rankedEntries,
      heuristicEntries: [],
      llmPostIds: new Set(rankedEntries.map((entry) => String(entry.post.id))),
      entriesById: new Map(rankedEntries.map((entry) => [String(entry.post.id), entry])),
    };
  }

  const selectedEntries = [];
  const selectedIds = new Set();
  const addCandidates = (candidateEntries, targetSize) => {
    for (const entry of candidateEntries) {
      const postId = String(entry?.post?.id || '');
      if (!postId || selectedIds.has(postId)) continue;
      selectedIds.add(postId);
      selectedEntries.push(entry);
      if (selectedEntries.length >= targetSize) break;
    }
  };
  const entriesBySubreddit = new Map();
  for (const entry of rankedEntries) {
    const subredditKey = String(entry.post?.subreddit || '').toLowerCase() || '__unknown__';
    if (!entriesBySubreddit.has(subredditKey)) entriesBySubreddit.set(subredditKey, []);
    entriesBySubreddit.get(subredditKey).push(entry);
  }
  const coverageCandidates = Array.from(entriesBySubreddit.values())
    .map((subredditEntries) => sortEntriesBy(subredditEntries, (entry) => entry.opportunityScore)[0])
    .filter(Boolean);
  const coverageTarget = Math.min(
    coverageCandidates.length,
    normalizedLimit <= 3
      ? 1
      : Math.max(2, Math.min(Math.ceil(normalizedLimit * 0.3), Math.floor(normalizedLimit / 2)))
  );
  const explorationCount = Math.min(
    rankedEntries.length - normalizedLimit,
    normalizedLimit >= 8 ? Math.min(5, Math.max(2, Math.ceil(normalizedLimit * 0.15))) : normalizedLimit >= 5 ? 1 : 0
  );
  const regularTarget = Math.max(0, normalizedLimit - explorationCount);

  addCandidates(sortEntriesBy(coverageCandidates, (entry) => entry.opportunityScore), coverageTarget);
  addCandidates(sortEntriesBy(rankedEntries, (entry) => entry.opportunityScore), Math.max(coverageTarget, Math.ceil(regularTarget * 0.55)));
  addCandidates(sortEntriesBy(rankedEntries, (entry) => entry.freshnessRank), Math.max(coverageTarget, Math.ceil(regularTarget * 0.75)));
  addCandidates(sortEntriesBy(rankedEntries, (entry) => entry.velocityRank), Math.max(coverageTarget, Math.ceil(regularTarget * 0.9)));
  addCandidates(sortEntriesBy(rankedEntries, (entry) => entry.lexicalRank), regularTarget);
  addCandidates(sortEntriesBy(rankedEntries, (entry) => entry.opportunityScore), regularTarget);

  const remainingEntries = rankedEntries.filter((entry) => !selectedIds.has(String(entry.post.id)));
  const explorationEntries = pickExplorationEntries(
    sortEntriesBy(remainingEntries, (entry) => entry.freshnessRank + (entry.velocityRank * 0.5)),
    explorationCount
  );
  const llmEntries = selectedEntries.slice(0, regularTarget).concat(explorationEntries).slice(0, normalizedLimit);
  const llmPostIds = new Set(llmEntries.map((entry) => String(entry.post.id)));
  const heuristicEntries = rankedEntries.filter((entry) => !llmPostIds.has(String(entry.post.id)));

  return {
    keywords,
    entries: rankedEntries,
    llmEntries,
    heuristicEntries,
    llmPostIds,
    entriesById: new Map(rankedEntries.map((entry) => [String(entry.post.id), entry])),
  };
}

function buildHeuristicResult(entry, {
  failed = false,
  rankedAt = new Date().toISOString(),
} = {}) {
  const score = normalizeHeuristicScore(entry?.heuristicScore ?? entry?.heuristicDetails?.score);
  const opportunity = buildHeuristicOpportunity(entry, { failed });
  const reason = failed
    ? 'Showing a light review fallback for this post'
    : 'Heuristic match pending deeper AI review';
  return {
    score,
    metadata: {
      source: failed ? 'llm_failed_heuristic_fallback' : 'heuristic',
      confidence: 'low',
      reason,
    },
    review: {
      status: failed ? 'failed' : 'heuristic_only',
        source: failed ? 'heuristic_fallback' : 'heuristic',
      failed,
      rankedAt,
    },
    opportunity,
  };
}

function buildAiItem({
  post = {},
  score = null,
  metadata = null,
  opportunity = null,
  review = null,
} = {}) {
  return {
    postId: String(post.id || ''),
    post: { ...post },
    score,
    metadata: metadata || null,
    opportunity: opportunity || null,
    review: review || null,
  };
}

module.exports = {
  extractGoalKeywords,
  computeHeuristicDetails,
  normalizeHeuristicScore,
  buildReviewPlan,
  buildHeuristicResult,
  buildHeuristicOpportunity,
  buildAiItem,
};
