const { describe, test, expect, beforeEach } = require('@jest/globals');

const mockPoll = jest.fn();

jest.mock('../../../lib/poller', () => ({
  RedditPoller: jest.fn().mockImplementation(() => ({
    poll: mockPoll,
  })),
}));

jest.mock('../../../lib/services/poller-config', () => ({
  loadPollerRuntimeConfig: jest.fn(),
}));

const { loadPollerRuntimeConfig } = require('../../../lib/services/poller-config');
const refreshLeadsHandler = require('../../../api/cron/refresh-leads');
const { runHandler } = require('../../helpers/run-handler');

describe('/api/cron/refresh-leads', () => {
  beforeEach(() => {
    process.env.CRON_SECRET_KEY = 'cron-secret';
    process.env.REDDIT_CLIENT_ID = 'reddit-client-id';
    process.env.REDDIT_CLIENT_SECRET = 'reddit-client-secret';
    mockPoll.mockReset();
    loadPollerRuntimeConfig.mockReset();
  });

  test('uses resolved agent config and returns poll summary', async () => {
    loadPollerRuntimeConfig.mockResolvedValue({
      source: 'agent-config',
      subreddits: ['saas', 'smallbusiness'],
      settings: {
        aiGoals: 'Find B2B SaaS leads',
        aiContext: 'Prioritize urgent buying intent',
        aiThreshold: 4,
        openRouterModel: 'openai/gpt-4o-mini',
        scoringConfig: {
          lookingFor: 'Find B2B SaaS leads',
          avoid: 'Students',
          examples: {
            perfect: 'Founder needs pipeline help now',
          },
        },
      },
    });
    mockPoll.mockResolvedValue({
      polledAt: '2026-03-08T12:00:00.000Z',
      postCount: 14,
      hotLeadCount: 3,
      subreddits: ['saas', 'smallbusiness'],
    });

    const res = await runHandler(refreshLeadsHandler, {
      method: 'GET',
      url: '/api/cron/refresh-leads',
      headers: {
        origin: 'http://localhost:3000',
        'x-cron-secret': 'cron-secret',
      },
    });

    expect(res.status).toBe(200);
    expect(mockPoll).toHaveBeenCalledWith(
      ['saas', 'smallbusiness'],
      {
        aiGoals: 'Find B2B SaaS leads',
        aiContext: 'Prioritize urgent buying intent',
        aiThreshold: 4,
        openRouterModel: 'openai/gpt-4o-mini',
        scoringConfig: {
          lookingFor: 'Find B2B SaaS leads',
          avoid: 'Students',
          examples: {
            perfect: 'Founder needs pipeline help now',
          },
        },
      }
    );
    expect(res.body).toEqual({
      success: true,
      polledAt: '2026-03-08T12:00:00.000Z',
      postsFetched: 14,
      hotLeadsFound: 3,
      subreddits: ['saas', 'smallbusiness'],
      subredditCount: 2,
      usingUserConfig: true,
      configSource: 'agent-config',
      nextPoll: 'In 2 hours (set via cron-job.org)',
    });
  });

  test('falls back to default settings when no user config exists', async () => {
    loadPollerRuntimeConfig.mockResolvedValue({
      source: 'defaults',
      subreddits: ['SEO', 'webdev', 'startups', 'freelance', 'marketing'],
      settings: {
        aiGoals: 'Find SEO and AI search consulting clients',
        aiContext: 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity)',
        aiThreshold: 4,
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        scoringConfig: null,
      },
    });
    mockPoll.mockResolvedValue({
      polledAt: '2026-03-08T12:00:00.000Z',
      postCount: 8,
      hotLeadCount: 1,
      subreddits: ['SEO', 'webdev', 'startups', 'freelance', 'marketing'],
    });

    const res = await runHandler(refreshLeadsHandler, {
      method: 'GET',
      url: '/api/cron/refresh-leads',
      headers: {
        'x-cron-secret': 'cron-secret',
      },
    });

    expect(res.status).toBe(200);
    expect(mockPoll).toHaveBeenCalledWith(
      ['SEO', 'webdev', 'startups', 'freelance', 'marketing'],
      {
        aiGoals: 'Find SEO and AI search consulting clients',
        aiContext: 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity)',
        aiThreshold: 4,
        openRouterModel: 'google/gemini-2.0-flash-exp:free',
        scoringConfig: null,
      }
    );
    expect(res.body.usingUserConfig).toBe(false);
    expect(res.body.configSource).toBe('defaults');
  });
});
