const { describe, test, expect } = require('@jest/globals');
const { runHandler, createMockRequest, createMockResponse } = require('../helpers/run-handler');

describe('app startup', () => {
  test('app module loads and creates an express app', () => {
    jest.isolateModules(() => {
      const createApp = require('../../app');
      expect(typeof createApp).toBe('function');

      const app = createApp();
      expect(typeof app).toBe('function');
      expect(typeof app.use).toBe('function');
      expect(typeof app.get).toBe('function');
    });
  });

  test('app sets baseline security headers and disables x-powered-by', async () => {
    let app;
    jest.isolateModules(() => {
      delete process.env.REDIS_URL;
      jest.doMock('../../lib/services/analysis-job-queue', () => ({
        ensureJobQueueWorker: jest.fn(),
      }));
      const createApp = require('../../app');
      app = createApp();
    });

    const res = await runHandler(app, {
      method: 'GET',
      url: '/api/health',
    });

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  test('workspace snapshot OPTIONS is routed to the handler for CORS preflight', async () => {
    let app;
    jest.isolateModules(() => {
      delete process.env.REDIS_URL;
      jest.doMock('../../lib/services/analysis-job-queue', () => ({
        ensureJobQueueWorker: jest.fn(),
      }));
      const createApp = require('../../app');
      app = createApp();
    });

    const res = await runHandler(app, {
      method: 'OPTIONS',
      url: '/api/workspaces/ws_demo/snapshot',
      params: { workspaceId: 'ws_demo' },
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PUT',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toBe('GET, PUT, OPTIONS');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('workspace routes are registered as the primary public API surface', () => {
    let app;
    jest.isolateModules(() => {
      delete process.env.REDIS_URL;
      jest.doMock('../../lib/services/analysis-job-queue', () => ({
        ensureJobQueueWorker: jest.fn(),
      }));
      const createApp = require('../../app');
      app = createApp();
    });

    const routeLayers = app._router.stack.filter((layer) => layer.route);
    const routePaths = new Set(routeLayers.map((layer) => layer.route.path));

    expect(routePaths.has('/api/workspaces')).toBe(true);
    expect(routePaths.has('/api/workspaces/:workspaceId/snapshot')).toBe(true);
    expect(routePaths.has('/api/workspaces/:workspaceId/config')).toBe(true);
    expect(routePaths.has('/api/workspaces/:workspaceId/analyze')).toBe(true);
    expect(routePaths.has('/api/workspaces/:workspaceId/jobs/:jobId')).toBe(true);
    expect(routePaths.has('/api/v1/snapshot')).toBe(false);
    expect(routePaths.has('/api/v1/config')).toBe(false);
    expect(routePaths.has('/api/v1/analyze')).toBe(false);
    expect(routePaths.has('/api/v1/jobs/:jobId')).toBe(false);
    expect(routePaths.has('/api/v1/jobs/drain')).toBe(true);
  });

  test('GET /api/reddit/advance does not fall through to the SPA shell', async () => {
    let app;
    jest.isolateModules(() => {
      delete process.env.REDIS_URL;
      jest.doMock('../../lib/services/analysis-job-queue', () => ({
        ensureJobQueueWorker: jest.fn(),
      }));
      const createApp = require('../../app');
      app = createApp();
    });

    const req = createMockRequest({
      method: 'GET',
      url: '/api/reddit/advance',
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    const { res } = createMockResponse();

    await new Promise((resolve, reject) => {
      app.handle(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
      setTimeout(resolve, 25);
    });

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });
});
