const { describe, test, expect } = require('@jest/globals');

const {
  buildOpportunityRecord,
  computeOpportunityScores,
  computeFreshnessSignal,
  computeMomentumSignal,
} = require('../../../lib/services/opportunity-engine');

describe('opportunity-engine', () => {
  test('computes bounded deterministic scores from normalized signals', () => {
    const scores = computeOpportunityScores({
      commercialIntent: 0.9,
      serviceFit: 0.85,
      buyerSignal: 0.8,
      urgency: 0.7,
      replyability: 0.75,
      researchValue: 0.2,
      authorityFit: 0.65,
      risk: 0.1,
      freshness: 0.8,
      momentum: 0.6,
    });

    expect(scores.replyLikelihood).toBeGreaterThan(0.6);
    expect(scores.clientConversionLikelihood).toBeGreaterThan(0.7);
    expect(scores.priority).toBeGreaterThan(0.65);
    expect(scores.priority).toBeLessThanOrEqual(1);
  });

  test('builds opportunity record and derives legacy score for structured analysis', () => {
    const post = {
      id: 'p1',
      title: 'Need help recovering traffic',
      score: 12,
      num_comments: 4,
      created_utc: Math.floor(Date.now() / 1000) - 3600,
    };

    const record = buildOpportunityRecord({
      post,
      raw: {
        opportunityType: 'lead',
        recommendedAction: 'reply_now',
        signals: {
          commercialIntent: 0.95,
          serviceFit: 0.9,
          buyerSignal: 0.8,
          urgency: 0.85,
          replyability: 0.8,
          researchValue: 0.2,
          authorityFit: 0.7,
          risk: 0.1,
        },
        reason: 'Owner is asking for help after recent traffic loss',
      },
    });

    expect(record.classification.type).toBe('lead');
    expect(record.action.recommended).toBe('reply_now');
    expect(record.scores.priority).toBeGreaterThan(0.7);
    expect(record.legacyScore).toBeGreaterThanOrEqual(4);
    expect(record.explanation.summary).toContain('traffic loss');
  });

  test('freshness and momentum favor newer active threads', () => {
    const now = Math.floor(Date.now() / 1000);
    const fresh = computeFreshnessSignal({ created_utc: now - 1800 }, now);
    const stale = computeFreshnessSignal({ created_utc: now - (10 * 24 * 3600) }, now);
    const active = computeMomentumSignal({ created_utc: now - 3600, score: 120, num_comments: 30 }, now);
    const flat = computeMomentumSignal({ created_utc: now - (24 * 3600), score: 2, num_comments: 0 }, now);

    expect(fresh).toBeGreaterThan(stale);
    expect(active).toBeGreaterThan(flat);
  });
});
