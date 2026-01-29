# Test Suite

This test suite validates the Reddit Dashboard against its North Star goal: **"Decide what to do next on Reddit in minutes"**.

## Test Structure

### Integration Tests (`__tests__/integration/`)

- **`north-star.test.js`** - Tests the complete user journey from authentication through fetching, ranking, and surfacing actionable posts. Validates performance and quality metrics.
- **`resilience.test.js`** - Tests error handling, rate limiting, token refresh, and graceful degradation.
- **`ai-quality.test.js`** - Validates AI ranking calibration, relevance scoring, and batching efficiency.

### Unit Tests (`__tests__/unit/`)

- **`lib/pkce.test.js`** - Tests PKCE OAuth utilities
- **`lib/cookies.test.js`** - Tests signed cookie creation and validation
- **`lib/cors.test.js`** - Tests CORS handling

### API Tests (`__tests__/api/`)

- **`auth/start.test.js`** - Tests OAuth initiation
- **`auth/status.test.js`** - Tests authentication status endpoint
- **`settings/openrouter-key.test.js`** - Tests secure API key storage

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- north-star.test.js
```

## Test Goals

These tests are designed to:

1. **Validate North Star**: Ensure the complete workflow (auth → fetch → rank → surface) completes in reasonable time and surfaces relevant posts.

2. **Measure Performance**: Track metrics like:
   - Time to fetch multiple subreddits
   - Time to rank posts with AI
   - Overall workflow completion time

3. **Ensure Resilience**: Verify the app handles:
   - Rate limiting gracefully
   - Token expiration and refresh
   - Network errors
   - Invalid data

4. **Validate Quality**: Check that:
   - AI ranking properly calibrates scores (top 10% get ≥7)
   - Posts are ranked by relevance to user goals
   - Batching is efficient for large post lists

5. **Guide Iteration**: Tests provide actionable feedback:
   - Performance metrics in console output
   - Quality metrics (e.g., "Surfaces X highly relevant posts")
   - Clear error messages for failures

## Test Metrics

The tests output helpful metrics:

- ⏱️ Performance timing (e.g., "Workflow completed in 45000ms")
- ✅ Quality metrics (e.g., "Surfaces 5 highly relevant posts (score ≥ 7)")
- 📊 Calibration checks (e.g., "3 posts scored ≥7 out of 20")
- 🔄 Batching efficiency (e.g., "Batched 100 posts into 4 requests")

## Continuous Improvement

These tests are designed to be run by agents/CI systems and provide feedback that guides iterative improvements:

- If performance degrades, tests will show timing metrics
- If AI ranking quality drops, tests will show calibration issues
- If resilience breaks, tests will catch error handling failures

Run tests frequently during development to catch regressions early.
