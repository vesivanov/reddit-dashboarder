const { describe, test, expect } = require('@jest/globals');

const {
  extractGoalKeywords,
  computeHeuristicScore,
  calibrateScores,
  getAutoRefreshPlan,
} = require('../../../lib/ui-helpers');

describe('UI Helpers', () => {
  test('extractGoalKeywords removes stop words and adds bigrams', () => {
    const keywords = extractGoalKeywords('React and TypeScript for React Engineers, looking for design tips');
    expect(keywords).toEqual(expect.arrayContaining(['react', 'typescript', 'engineers', 'looking', 'design', 'tips']));
    expect(keywords).toEqual(expect.arrayContaining(['react typescript']));
    expect(keywords).not.toContain('and');
    expect(keywords).not.toContain('for');
  });

  test('computeHeuristicScore rewards title matches and engagement', () => {
    const post = {
      title: 'React TypeScript best practices',
      selftext: 'A long writeup',
      subreddit: 'reactjs',
      domain: 'example.com',
      score: 600,
      num_comments: 80,
    };
    const score = computeHeuristicScore(post, ['react', 'typescript']);
    expect(score).toBeGreaterThanOrEqual(10.5); // title (6) + domain (0.5) + engagement (4)
  });

  test('calibrateScores normalizes distribution and handles single entry', () => {
    const single = new Map([['a', 5]]);
    const calibratedSingle = calibrateScores(single);
    expect(calibratedSingle.get('a')).toBe(5);

    const scores = new Map([
      ['a', 10],
      ['b', 5],
      ['c', 1],
    ]);
    const calibrated = calibrateScores(scores);
    expect(calibrated.get('a')).toBeGreaterThan(calibrated.get('b'));
    expect(calibrated.get('b')).toBeGreaterThan(calibrated.get('c'));
  });

  test('getAutoRefreshPlan returns interval metadata only when enabled', () => {
    const disabled = getAutoRefreshPlan({ autoRefreshEnabled: false, subsLength: 3, intervalMinutes: 10, now: 0 });
    expect(disabled.shouldSchedule).toBe(false);
    expect(disabled.nextRefreshAt).toBeNull();

    const plan = getAutoRefreshPlan({ autoRefreshEnabled: true, subsLength: 2, intervalMinutes: 2, now: 1000, minMinutes: 5 });
    expect(plan.shouldSchedule).toBe(true);
    expect(plan.intervalMs).toBe(5 * 60 * 1000); // min clamped
    expect(plan.nextRefreshAt).toBe(1000 + plan.intervalMs);
  });

  test('getAutoRefreshPlan handles invalid intervalMinutes gracefully', () => {
    // Test with NaN
    const plan1 = getAutoRefreshPlan({ autoRefreshEnabled: true, subsLength: 2, intervalMinutes: NaN, now: 1000, minMinutes: 5 });
    expect(plan1.intervalMs).toBe(5 * 60 * 1000);

    // Test with null
    const plan2 = getAutoRefreshPlan({ autoRefreshEnabled: true, subsLength: 2, intervalMinutes: null, now: 1000, minMinutes: 5 });
    expect(plan2.intervalMs).toBe(5 * 60 * 1000);

    // Test with undefined
    const plan3 = getAutoRefreshPlan({ autoRefreshEnabled: true, subsLength: 2, intervalMinutes: undefined, now: 1000, minMinutes: 5 });
    expect(plan3.intervalMs).toBe(5 * 60 * 1000);

    // Test with negative number
    const plan4 = getAutoRefreshPlan({ autoRefreshEnabled: true, subsLength: 2, intervalMinutes: -5, now: 1000, minMinutes: 5 });
    expect(plan4.intervalMs).toBe(5 * 60 * 1000);

    // Test with zero
    const plan5 = getAutoRefreshPlan({ autoRefreshEnabled: true, subsLength: 2, intervalMinutes: 0, now: 1000, minMinutes: 5 });
    expect(plan5.intervalMs).toBe(5 * 60 * 1000);

    // Test with valid number above minimum
    const plan6 = getAutoRefreshPlan({ autoRefreshEnabled: true, subsLength: 2, intervalMinutes: 10, now: 1000, minMinutes: 5 });
    expect(plan6.intervalMs).toBe(10 * 60 * 1000);
  });
});
