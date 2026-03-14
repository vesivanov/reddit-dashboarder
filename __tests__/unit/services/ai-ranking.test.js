const {
  PROMPT_VERSION,
  buildSystemPrompt,
  buildModelAttemptOrder,
  shouldRetryOpenRouterModel,
  shouldRelaxOpenRouterRequest,
  buildOpenRouterRequestStrategies,
} = require('../../../lib/services/ai-ranking');

describe('ai-ranking prompt', () => {
  test('uses the upgraded prompt version', () => {
    expect(PROMPT_VERSION).toBe('v6.0');
  });

  test('includes buyer-intent rules and fallback examples when user examples are empty', () => {
    const prompt = buildSystemPrompt({
      userGoals: 'Find paid SEO leads',
      userContext: 'Prioritize businesses asking for help now',
      scoringConfig: {
        lookingFor: 'Find paid SEO leads',
        avoid: 'memes, jokes, off-topic',
        examples: {
          perfect: '',
          strong: '',
          reject: '',
        },
      },
    });

    expect(prompt).toContain('Buyer rule:');
    expect(prompt).toContain('Type rule: use lead only when buying or help-seeking intent is explicit or strongly implied;');
    expect(prompt).toContain('Founder or operator says traffic, leads, or revenue dropped');
    expect(prompt).toContain('Student, job seeker, freelancer selling services');
  });

  test('builds free-model fallback order with the requested model first', () => {
    expect(buildModelAttemptOrder('meta-llama/llama-3.3-70b-instruct:free')).toEqual([
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen3-next-80b-a3b-instruct:free',
      'stepfun/step-3.5-flash:free',
    ]);
  });

  test('retries free-model attempts only on transient upstream statuses', () => {
    expect(shouldRetryOpenRouterModel({ status: 404 })).toBe(true);
    expect(shouldRetryOpenRouterModel({ status: 429 })).toBe(true);
    expect(shouldRetryOpenRouterModel({ status: 503 })).toBe(true);
    expect(shouldRetryOpenRouterModel({ status: 400 })).toBe(false);
  });

  test('relaxes request shape when OpenRouter rejects routing parameters', () => {
    expect(shouldRelaxOpenRouterRequest({ status: 404 })).toBe(true);
    expect(shouldRelaxOpenRouterRequest({ status: 400, responseText: 'unsupported response_format' })).toBe(true);
    expect(shouldRelaxOpenRouterRequest({ status: 429, responseText: 'rate limited' })).toBe(false);
  });

  test('builds progressively simpler request strategies for routing fallback', () => {
    const strategies = buildOpenRouterRequestStrategies('meta-llama/llama-3.3-70b-instruct:free');

    expect(strategies.map((strategy) => strategy.id)).toEqual([
      'strict_json_schema',
      'relaxed_json_schema',
      'plain_json',
    ]);
  });
});
