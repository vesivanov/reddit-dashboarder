const { describe, test, expect } = require('@jest/globals');

const aiRankHandler = require('../../../../../lib/api-handlers/reddit/ai-rank');
const { buildBatches } = aiRankHandler;

describe('buildBatches', () => {
  test('splits posts by max posts per batch', () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, title: `Title ${i}` }));
    const batches = buildBatches(posts, { maxPostsPerBatch: 2 });
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(2);
    expect(batches[2]).toHaveLength(1);
  });

  test('respects token limit and normalizes metadata', () => {
    const posts = [
      {
        id: 'link1',
        title: 'Link Post',
        selftext: '',
        subreddit: 'testSub',
        external_url: 'https://example.com/articles/123',
        score: 10,
        num_comments: 5,
        created_utc: Math.floor(Date.now() / 1000) - 3600,
        link_flair_text: 'News',
      },
      {
        id: 'text1',
        title: 'Very long content',
        selftext: 'x'.repeat(500),
        subreddit: 'another',
      },
    ];

    const batches = buildBatches(posts, { maxTokensPerBatch: 60, perPostTextLimit: 50 });
    expect(batches).toHaveLength(2); // Token limit forces split

    const normalized = batches[0][0];
    expect(normalized.id).toBe('link1');
    expect(normalized.url_domain).toBe('example.com');
    expect(normalized.url_path).toBe('/articles/123');
    expect(normalized.is_link_post).toBe(true);
    expect(normalized.text.length).toBeLessThanOrEqual(50);
  });
});
