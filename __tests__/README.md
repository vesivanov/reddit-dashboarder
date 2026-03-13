# Test Suite

This test suite validates the Reddit Dashboard against its North Star goal: **"Decide what to do next on Reddit in minutes"**.

## Test Structure

### Integration Tests (`__tests__/integration/`)

- **`app-startup.test.js`** - Verifies the Express app boots with the intended route surface and baseline security defaults.
- **`server-contract.test.js`** - Exercises handler-level request/response contracts for the core Reddit and AI ranking APIs.
- **`schema-contract.test.js`** - Locks response shapes for the core APIs to catch breaking payload drift.
- **`vercel-routing.test.js`** - Checks the deployment routing order in `vercel.json`.

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

1. **Protect the public contract**: Keep workspace, auth, Reddit fetch, and AI ranking routes aligned with the current app surface.

2. **Catch schema drift**: Fail quickly when handlers change response shape or headers in ways the frontend depends on.

3. **Validate route behavior**: Ensure the app and deployment routing expose the expected landing page, SPA shell, and API endpoints.

4. **Guide iteration**: Keep tests focused on assertions that would catch real behavioral regressions instead of broad “did not crash” checks.

## Continuous Improvement

Prefer adding tests at the route or contract level when behavior changes. Remove tests that only restate mocked inputs or verify that a handler merely returns some response, because those tend to stay green through real regressions.
