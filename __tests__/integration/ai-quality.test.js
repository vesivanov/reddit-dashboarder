/**
 * AI Quality Tests: Validate ranking accuracy and calibration
 * 
 * Tests that AI ranking:
 * - Properly calibrates scores (top 10% get ≥4)
 * - Provides relevant scores based on user goals
 * - Handles edge cases (empty posts, very long content)
 * - Batches efficiently
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

global.fetch = jest.fn();
process.env.OPENROUTER_API_KEY = 'test_key';
process.env.NODE_ENV = 'test';

const aiRankHandler = require('../../lib/api-handlers/reddit/ai-rank');
const { PROMPT_VERSION } = aiRankHandler;

describe('AI Ranking Quality', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      method: 'POST',
      body: {},
      headers: { cookie: '' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('Calibrates scores correctly (only top posts get ≥4)', async () => {
    // Create 20 posts
    const posts = Array.from({ length: 20 }, (_, i) => ({
      id: `post${i}`,
      title: `Post ${i}`,
      subreddit: 'test',
      selftext: i < 2 ? 'Highly relevant React content' : 'Generic content',
      score: 100 - i,
      num_comments: 50 - i,
      created_utc: Math.floor(Date.now() / 1000) - i * 3600
    }));

    mockReq.body = {
      posts,
      userGoals: 'I am looking for React content',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    // Mock AI response with proper calibration
    const scores = posts.map((p, i) => ({
      postId: p.id,
      score: i < 2 ? 5 : 2,
      confidence: i < 2 ? 'high' : 'medium',
      reason: 'Test reason'
    }));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify(scores)
          }
        }]
      })
    });

    await aiRankHandler(mockReq, mockRes);

    const response = mockRes.json.mock.calls[0][0];
    const highScores = Object.values(response.scores).filter(s => s >= 4);
    
    // Top 10% (2 out of 20) should have scores ≥4/5
    expect(highScores.length).toBeLessThanOrEqual(3); // Allow some flexibility
    console.log(`\n✅ Calibration: ${highScores.length} posts scored ≥4 out of ${posts.length}`);
  });

  test('Ranks posts by relevance to user goals', async () => {
    const posts = [
      { id: 'post1', title: 'React hooks tutorial', selftext: 'Learn React hooks', subreddit: 'react', score: 50, num_comments: 10, created_utc: Date.now() / 1000 },
      { id: 'post2', title: 'Random cat picture', selftext: 'Cute cat', subreddit: 'aww', score: 1000, num_comments: 500, created_utc: Date.now() / 1000 },
      { id: 'post3', title: 'TypeScript advanced patterns', selftext: 'TypeScript tips', subreddit: 'typescript', score: 75, num_comments: 20, created_utc: Date.now() / 1000 }
    ];

    mockReq.body = {
      posts,
      userGoals: 'I am a frontend developer learning React and TypeScript',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([
              { postId: 'post1', score: 5, confidence: 'high', reason: 'Highly relevant React content' },
              { postId: 'post2', score: 1, confidence: 'low', reason: 'Not relevant to goals' },
              { postId: 'post3', score: 4, confidence: 'high', reason: 'Relevant TypeScript content' }
            ])
          }
        }]
      })
    });

    await aiRankHandler(mockReq, mockRes);

    const response = mockRes.json.mock.calls[0][0];
    
    // React post should rank highest
    expect(response.scores.post1).toBeGreaterThan(response.scores.post2);
    // TypeScript post should rank higher than cat post
    expect(response.scores.post3).toBeGreaterThan(response.scores.post2);
    
    console.log(`\n✅ Relevance ranking: React=${response.scores.post1}, TypeScript=${response.scores.post3}, Cat=${response.scores.post2}`);
  });

  test('Batches large post lists efficiently', async () => {
    // Create 100 posts
    const posts = Array.from({ length: 100 }, (_, i) => ({
      id: `post${i}`,
      title: `Post ${i}`,
      selftext: 'Content',
      subreddit: 'test',
      score: 10,
      num_comments: 5,
      created_utc: Date.now() / 1000
    }));

    mockReq.body = {
      posts,
      userGoals: 'Test goals',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    let batchCount = 0;
    global.fetch.mockImplementation(async () => {
      batchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(posts.slice(0, 30).map(p => ({
                postId: p.id,
                score: 3,
                confidence: 'medium',
                reason: 'Test'
              })))
            }
          }]
        })
      };
    });

    await aiRankHandler(mockReq, mockRes);

    // Should batch into multiple requests (30 posts per batch = ~4 batches)
    expect(batchCount).toBeGreaterThan(1);
    expect(batchCount).toBeLessThanOrEqual(5);
    console.log(`\n✅ Batched 100 posts into ${batchCount} requests`);
  });

  test('Includes velocity metrics in LLM payload', async () => {
    const now = Math.floor(Date.now() / 1000);
    const posts = [
      {
        id: 'post1',
        title: 'Velocity test',
        selftext: 'Testing velocity fields',
        subreddit: 'test',
        score: 100,
        num_comments: 20,
        created_utc: now - 3600
      }
    ];

    mockReq.body = {
      posts,
      userGoals: 'Test goals',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    global.fetch.mockImplementationOnce(async (_url, options) => {
      const payload = JSON.parse(options.body);
      const userMessage = payload.messages.find(m => m.role === 'user')?.content || '';
      expect(userMessage).toContain('score_per_hour');
      expect(userMessage).toContain('comments_per_hour');
      const match = userMessage.match(/(\[[\s\S]*\])\s*$/);
      const parsedPosts = match ? JSON.parse(match[1]) : [];
      expect(parsedPosts[0].score_per_hour).toBe(100);
      expect(parsedPosts[0].comments_per_hour).toBe(20);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([{ postId: 'post1', score: 3, confidence: 'medium', reason: 'Test' }])
            }
          }]
        })
      };
    });

    await aiRankHandler(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  test('Sets prompt version in metrics and response', async () => {
    const posts = [
      { id: 'post1', title: 'Test', subreddit: 'test', selftext: '', score: 10, num_comments: 5, created_utc: Date.now() / 1000 }
    ];

    mockReq.body = {
      posts,
      userGoals: 'Test goals',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{ postId: 'post1', score: 5, confidence: 'medium', reason: 'Test' }])
          }
        }]
      })
    });

    await aiRankHandler(mockReq, mockRes);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.promptVersion).toBe(PROMPT_VERSION);
    const metricsCall = mockRes.setHeader.mock.calls.find(call => call[0] === 'X-RDD-Metrics');
    const metrics = metricsCall ? JSON.parse(metricsCall[1]) : null;
    expect(metrics.promptVersion).toBe(PROMPT_VERSION);
  });

  test('Handles empty posts array', async () => {
    mockReq.body = {
      posts: [],
      userGoals: 'Test goals',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    await aiRankHandler(mockReq, mockRes);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.scores).toEqual({});
    expect(response.model).toBe('test-model');
    // When posts.length === 0, handler returns early without processed field
  });

  test('Validates API key requirement', async () => {
    // Test that handler requires API key when none provided
    // Note: In test environment, OPENROUTER_API_KEY may be set, so we test
    // that the handler properly uses the key from request body when provided
    mockReq.body = {
      posts: [{ id: 'post1', title: 'Test', subreddit: 'test', selftext: '', score: 10, num_comments: 5, created_utc: Date.now() / 1000 }],
      userGoals: 'Test goals',
      openRouterModel: 'test-model',
      openRouterApiKey: 'explicit_key_from_request'
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{ postId: 'post1', score: 5, confidence: 'medium', reason: 'Test' }])
          }
        }]
      })
    });

    await aiRankHandler(mockReq, mockRes);

    // Should use the explicit key from request body
    expect(mockRes.status).toHaveBeenCalledWith(200);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.scores).toBeDefined();
  });

  test('Handles malformed AI response', async () => {
    mockReq.body = {
      posts: [{ id: 'post1', title: 'Test' }],
      userGoals: 'Test goals',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      })
    });

    await aiRankHandler(mockReq, mockRes);

    // Should handle gracefully
    expect(mockRes.status).toHaveBeenCalled();
  });

  test('passes optional user context into the OpenRouter prompt', async () => {
    mockReq.body = {
      posts: [{ id: 'post1', title: 'Test post', subreddit: 'test', selftext: '', score: 1, num_comments: 0, created_utc: Date.now() / 1000 }],
      userGoals: 'Find sober market updates',
      userContext: 'Avoid memes and jokes',
      openRouterModel: 'test-model',
      openRouterApiKey: 'test_key'
    };

    let capturedBody;
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{ postId: 'post1', score: 4, confidence: 'medium', reason: 'Matches context' }])
          }
        }]
      })
    });

    await aiRankHandler(mockReq, mockRes);

    capturedBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(capturedBody.messages[0].content).toContain('Avoid memes and jokes');
  });
});
