const { describe, test, expect } = require('@jest/globals');

const {
  buildDerivedGoalText,
  buildDerivedContextText,
  buildSettingsFromAgentConfig,
} = require('../../../lib/services/poller-config');

describe('poller-config opportunity mapping', () => {
  test('builds derived goal and context text from opportunity config', () => {
    const opportunityConfig = {
      businessOffering: 'SEO consulting',
      idealCustomer: 'SMB owners',
      problemsSolved: 'Traffic drops',
      preferredEngagement: 'reply',
      strategyPreset: 'sales',
      opportunityTypes: ['lead', 'pain_point'],
      strictness: 'strict',
    };

    const goals = buildDerivedGoalText(opportunityConfig, 'Additional goal');
    const context = buildDerivedContextText(opportunityConfig, 'Extra context');

    expect(goals).toContain('Offering: SEO consulting');
    expect(goals).toContain('Prioritize opportunities: lead, pain_point');
    expect(context).toContain('public reply first');
    expect(context).toContain('optimize for sales opportunities');
    expect(context).toContain('favor precision');
  });

  test('prefers derived opportunity text in poller settings', () => {
    const settings = buildSettingsFromAgentConfig({
      goals: 'Legacy goals',
      aiContext: 'Legacy context',
      threshold: 5,
      model: 'openai/gpt-4o-mini',
      opportunityConfig: {
        businessOffering: 'Growth consulting',
        idealCustomer: 'B2B SaaS teams',
        problemsSolved: 'Acquisition bottlenecks',
        preferredEngagement: 'either',
        strategyPreset: 'balanced',
        opportunityTypes: ['lead'],
        strictness: 'balanced',
      },
    });

    expect(settings.aiGoals).toContain('Growth consulting');
    expect(settings.aiContext).toContain('either public reply or direct outreach');
    expect(settings.aiThreshold).toBe(5);
    expect(settings.openRouterModel).toBe('openai/gpt-4o-mini');
    expect(settings.opportunityConfig).toBeTruthy();
  });
});
