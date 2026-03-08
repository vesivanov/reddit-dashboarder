const OPPORTUNITY_TYPES = [
  'lead',
  'pain_point',
  'tool_search',
  'competitor_mention',
  'content_opportunity',
  'noise',
];

const RECOMMENDED_ACTIONS = [
  'reply_now',
  'dm_if_possible',
  'save_for_followup',
  'research',
  'ignore',
];

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeSignal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1 && n >= 0) return n;
  if (n <= 5 && n >= 0) return n / 5;
  if (n <= 100 && n >= 0) return n / 100;
  return clamp01(n);
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  if (allowed.includes(normalized)) return normalized;
  return fallback;
}

function computeFreshnessSignal(post = {}, nowSeconds = Date.now() / 1000) {
  const created = Number(post.created_utc) || 0;
  if (!created) return 0.5;
  const ageHours = Math.max(0, (nowSeconds - created) / 3600);
  if (ageHours <= 1) return 1;
  if (ageHours <= 6) return 0.9;
  if (ageHours <= 24) return 0.75;
  if (ageHours <= 72) return 0.45;
  if (ageHours <= 168) return 0.2;
  return 0.05;
}

function computeMomentumSignal(post = {}, nowSeconds = Date.now() / 1000) {
  const created = Number(post.created_utc) || 0;
  const ageHours = created ? Math.max(1, (nowSeconds - created) / 3600) : 24;
  const scorePerHour = (Number(post.score) || 0) / ageHours;
  const commentsPerHour = (Number(post.num_comments) || 0) / ageHours;
  const scoreSignal = Math.min(1, scorePerHour / 25);
  const commentSignal = Math.min(1, commentsPerHour / 10);
  return clamp01((scoreSignal * 0.45) + (commentSignal * 0.55));
}

function buildSignalSet(post = {}, raw = {}) {
  return {
    commercialIntent: normalizeSignal(raw.commercialIntent),
    serviceFit: normalizeSignal(raw.serviceFit),
    buyerSignal: normalizeSignal(raw.buyerSignal),
    urgency: normalizeSignal(raw.urgency),
    replyability: normalizeSignal(raw.replyability),
    researchValue: normalizeSignal(raw.researchValue),
    authorityFit: normalizeSignal(raw.authorityFit),
    risk: normalizeSignal(raw.risk),
    freshness: computeFreshnessSignal(post),
    momentum: computeMomentumSignal(post),
  };
}

function computeOpportunityScores(signals) {
  const replyLikelihood = clamp01(
    (0.35 * signals.replyability) +
    (0.20 * signals.urgency) +
    (0.15 * signals.freshness) +
    (0.15 * signals.momentum) +
    (0.15 * signals.serviceFit) -
    (0.20 * signals.risk)
  );

  const clientConversionLikelihood = clamp01(
    (0.35 * signals.commercialIntent) +
    (0.25 * signals.serviceFit) +
    (0.15 * signals.buyerSignal) +
    (0.15 * signals.authorityFit) +
    (0.10 * signals.urgency) -
    (0.15 * signals.risk)
  );

  const priority = clamp01(
    (0.45 * clientConversionLikelihood) +
    (0.30 * replyLikelihood) +
    (0.15 * signals.freshness) +
    (0.10 * signals.momentum)
  );

  return {
    replyLikelihood,
    clientConversionLikelihood,
    priority,
  };
}

function chooseRecommendedAction(type, signals, scores, suggestedAction) {
  const normalizedSuggestion = normalizeEnum(suggestedAction, RECOMMENDED_ACTIONS, '');
  if (normalizedSuggestion) return normalizedSuggestion;
  if (type === 'noise' || signals.risk >= 0.8) return 'ignore';
  if (scores.clientConversionLikelihood >= 0.7 && scores.replyLikelihood >= 0.6) return 'reply_now';
  if (scores.clientConversionLikelihood >= 0.7) return 'dm_if_possible';
  if (signals.researchValue >= 0.65 && scores.clientConversionLikelihood < 0.45) return 'research';
  if (scores.priority >= 0.45) return 'save_for_followup';
  return 'ignore';
}

function buildExplanationBullets(type, signals) {
  const bullets = [];
  if (signals.commercialIntent >= 0.7) bullets.push('strong commercial intent');
  if (signals.serviceFit >= 0.7) bullets.push('strong service fit');
  if (signals.urgency >= 0.65) bullets.push('urgent problem');
  if (signals.replyability >= 0.65) bullets.push('good engagement opening');
  if (signals.researchValue >= 0.65) bullets.push('useful research signal');
  if (signals.freshness >= 0.75) bullets.push('recent and actionable');
  if (signals.momentum >= 0.6) bullets.push('active discussion');
  if (signals.risk >= 0.5) bullets.push('elevated outreach risk');
  if (!bullets.length) bullets.push(type === 'noise' ? 'low-value commercial signal' : 'moderate commercial signal');
  return bullets.slice(0, 3);
}

function buildSummary({ type, action, reason, signals }) {
  if (reason) return String(reason).trim().slice(0, 220);
  if (type === 'lead') {
    return action === 'reply_now'
      ? 'Likely lead with a credible opening for direct engagement.'
      : 'Potential lead worth monitoring for follow-up.';
  }
  if (type === 'pain_point') return 'Commercial pain point surfaced in discussion.';
  if (type === 'tool_search') return 'Active search for tools or vendors.';
  if (type === 'competitor_mention') return 'Competitor-related commercial signal worth review.';
  if (type === 'content_opportunity') return signals.researchValue >= 0.65
    ? 'Useful content or messaging opportunity.'
    : 'Potentially useful marketing insight.';
  return 'Low-value opportunity signal.';
}

function buildLegacyScore(scores, type) {
  if (type === 'noise') return 0;
  const priority = scores.priority;
  if (priority >= 0.85) return 5;
  if (priority >= 0.65) return 4;
  if (priority >= 0.45) return 3;
  if (priority >= 0.25) return 2;
  if (priority >= 0.1) return 1;
  return 0;
}

function inferOpportunityType(rawType, signals, legacyScore) {
  const normalizedType = normalizeEnum(rawType, OPPORTUNITY_TYPES, '');
  if (normalizedType) return normalizedType;
  if (signals.researchValue >= 0.75 && signals.commercialIntent < 0.55) return 'content_opportunity';
  if (signals.commercialIntent >= 0.7 && signals.serviceFit >= 0.65) return 'lead';
  if (signals.urgency >= 0.7) return 'pain_point';
  if (legacyScore >= 4) return 'lead';
  if (legacyScore <= 1) return 'noise';
  return 'pain_point';
}

function buildOpportunityRecord({ post = {}, raw = {}, metadata = {} }) {
  const signals = buildSignalSet(post, raw.signals || raw);
  const confidence = normalizeSignal(raw.confidenceScore || metadata.confidenceScore || 0.7);
  const legacyScore = Number.isFinite(Number(raw.score)) ? Number(raw.score) : null;
  const type = inferOpportunityType(raw.opportunityType || raw.type, signals, legacyScore);
  const scores = computeOpportunityScores(signals);
  const action = chooseRecommendedAction(type, signals, scores, raw.recommendedAction || raw.action);
  const summary = buildSummary({
    type,
    action,
    reason: raw.reason || metadata.reason,
    signals,
  });

  return {
    classification: {
      type,
      confidence,
    },
    signals,
    scores,
    action: {
      recommended: action,
      reason: summary,
    },
    explanation: {
      summary,
      bullets: buildExplanationBullets(type, signals),
    },
    legacyScore: legacyScore === null ? buildLegacyScore(scores, type) : Math.max(0, Math.min(5, Math.round(legacyScore))),
  };
}

module.exports = {
  OPPORTUNITY_TYPES,
  RECOMMENDED_ACTIONS,
  clamp01,
  normalizeSignal,
  computeFreshnessSignal,
  computeMomentumSignal,
  computeOpportunityScores,
  buildOpportunityRecord,
};
