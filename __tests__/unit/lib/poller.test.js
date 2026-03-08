const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

jest.mock('../../../lib/storage', () => ({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
}));

const storage = require('../../../lib/storage');
const { RedditPoller } = require('../../../lib/poller');

function mockJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('RedditPoller', () => {
  beforeEach(() => {
    process.env.REDDIT_CLIENT_ID = 'client-id';
    process.env.REDDIT_CLIENT_SECRET = 'client-secret';
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    delete process.env.POLLER_OPENROUTER_MODEL;
    storage.set.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
    delete process.env.OPENROUTER_API_KEY;
  });

  test('rankPostsWithAI applies returned scores to posts', async () => {
    const poller = new RedditPoller();
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      choices: [{
        message: {
          content: JSON.stringify([
            { postId: 'p1', score: 5, confidence: 'high', reason: 'Strong lead' },
            { postId: 'p2', score: 2, confidence: 'medium', reason: 'Weak lead' },
          ]),
        },
      }],
    }));

    const posts = [
      { id: 'p1', title: 'Need SEO help', subreddit: 'seo', selftext: '', score: 12, num_comments: 4 },
      { id: 'p2', title: 'General question', subreddit: 'marketing', selftext: '', score: 5, num_comments: 1 },
    ];

    const ranked = await poller.rankPostsWithAI(posts, {
      aiGoals: 'Find SEO leads',
      aiContext: 'Business owners preferred',
      scoringConfig: {
        lookingFor: 'Find SEO leads',
        avoid: 'Student homework',
        examples: {
          perfect: 'Need help recovering traffic for my business',
        },
      },
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({ id: 'p1', aiScoreProxy: 5 });
    expect(ranked[1]).toMatchObject({ id: 'p2', aiScoreProxy: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rankPostsWithAI uses explicit poller model from settings before env fallback', async () => {
    process.env.POLLER_OPENROUTER_MODEL = 'env/default-model';
    const poller = new RedditPoller();
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      choices: [{
        message: {
          content: JSON.stringify([
            { postId: 'p1', score: 3, confidence: 'high', reason: 'Relevant' },
          ]),
        },
      }],
    }));

    await poller.rankPostsWithAI([
      { id: 'p1', title: 'Need SEO help', subreddit: 'seo', selftext: '', score: 12, num_comments: 4 },
    ], {
      aiGoals: 'Find SEO leads',
      openRouterModel: 'custom/model',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"custom/model"'),
      })
    );
  });

  test('rankPostsWithAI falls back to POLLER_OPENROUTER_MODEL when settings model is absent', async () => {
    process.env.POLLER_OPENROUTER_MODEL = 'env/default-model';
    const poller = new RedditPoller();
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      choices: [{
        message: {
          content: JSON.stringify([
            { postId: 'p1', score: 3, confidence: 'high', reason: 'Relevant' },
          ]),
        },
      }],
    }));

    await poller.rankPostsWithAI([
      { id: 'p1', title: 'Need SEO help', subreddit: 'seo', selftext: '', score: 12, num_comments: 4 },
    ], {
      aiGoals: 'Find SEO leads',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"env/default-model"'),
      })
    );
  });

  test('poll stores latest opportunity payload with ranking metadata', async () => {
    const poller = new RedditPoller();
    const createdUtc = Math.floor(Date.now() / 1000) - 3600;

    global.fetch
      .mockResolvedValueOnce(mockJsonResponse({ access_token: 'reddit-access-token' }))
      .mockResolvedValueOnce(mockJsonResponse({
        data: {
          children: [
            {
              data: {
                id: 'lead1',
                title: 'Need SEO help urgently',
                selftext: 'Traffic dropped and I need help this week',
                subreddit: 'smallbusiness',
                author: 'alice',
                score: 28,
                num_comments: 9,
                created_utc: createdUtc,
                permalink: '/r/smallbusiness/comments/lead1',
                url: 'https://example.com/lead1',
              },
            },
          ],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'lead1', score: 4, confidence: 'high', reason: 'Explicit request for SEO help' },
            ]),
          },
        }],
      }));

    const result = await poller.poll(['smallbusiness'], {
      aiGoals: 'Find SEO leads',
      aiContext: 'Prioritize urgent business pain',
    });

    expect(result.postCount).toBe(1);
    expect(result.opportunityCount).toBe(1);
    expect(result.aiRankingWorked).toBe(true);
    expect(result.opportunities[0]).toMatchObject({
      id: 'lead1',
      subreddit: 'smallbusiness',
      aiScoreProxy: 4,
    });
    expect(storage.set).toHaveBeenCalledWith(
      'latest-opportunities',
      expect.objectContaining({
        postCount: 1,
        opportunityCount: 1,
        aiRankingWorked: true,
      }),
      7 * 24 * 60 * 60
    );
  });

  test('poll combines posts from multiple subreddits into one ranked run', async () => {
    const poller = new RedditPoller();
    const createdUtc = Math.floor(Date.now() / 1000) - 3600;

    global.fetch
      .mockResolvedValueOnce(mockJsonResponse({ access_token: 'reddit-access-token' }))
      .mockResolvedValueOnce(mockJsonResponse({
        data: {
          children: [{
            data: {
              id: 'lead1',
              title: 'Need SEO help urgently',
              selftext: 'Traffic dropped hard',
              subreddit: 'smallbusiness',
              author: 'alice',
              score: 28,
              num_comments: 9,
              created_utc: createdUtc,
              permalink: '/r/smallbusiness/comments/lead1',
              url: 'https://example.com/lead1',
            },
          }],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        data: {
          children: [{
            data: {
              id: 'lead2',
              title: 'Need help with rankings',
              selftext: 'Looking for someone to fix SEO',
              subreddit: 'saas',
              author: 'bob',
              score: 22,
              num_comments: 7,
              created_utc: createdUtc,
              permalink: '/r/saas/comments/lead2',
              url: 'https://example.com/lead2',
            },
          }],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'lead1', score: 4, confidence: 'high', reason: 'Strong lead' },
              { postId: 'lead2', score: 5, confidence: 'high', reason: 'Very strong lead' },
            ]),
          },
        }],
      }));

    const result = await poller.poll(['smallbusiness', 'saas'], {
      aiGoals: 'Find SEO leads',
    });

    expect(result.postCount).toBe(2);
    expect(result.opportunityCount).toBe(2);
    expect(result.subreddits).toEqual(['smallbusiness', 'saas']);
  });

  test('poll continues when one subreddit fetch fails', async () => {
    const poller = new RedditPoller();
    const createdUtc = Math.floor(Date.now() / 1000) - 3600;

    global.fetch
      .mockResolvedValueOnce(mockJsonResponse({ access_token: 'reddit-access-token' }))
      .mockResolvedValueOnce(mockJsonResponse({
        data: {
          children: [{
            data: {
              id: 'lead1',
              title: 'Need SEO help urgently',
              selftext: 'Traffic dropped hard',
              subreddit: 'smallbusiness',
              author: 'alice',
              score: 28,
              num_comments: 9,
              created_utc: createdUtc,
              permalink: '/r/smallbusiness/comments/lead1',
              url: 'https://example.com/lead1',
            },
          }],
        },
      }))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}), text: async () => 'unavailable' })
      .mockResolvedValueOnce(mockJsonResponse({
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'lead1', score: 4, confidence: 'high', reason: 'Strong lead' },
            ]),
          },
        }],
      }));

    const result = await poller.poll(['smallbusiness', 'saas'], {
      aiGoals: 'Find SEO leads',
    });

    expect(result.postCount).toBe(1);
    expect(result.opportunityCount).toBe(1);
    expect(result.subreddits).toEqual(['smallbusiness', 'saas']);
  });
});
