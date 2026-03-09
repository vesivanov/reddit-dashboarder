const { describe, test, expect } = require('@jest/globals');
const { runHandler } = require('../helpers/run-handler');

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

  test('agent snapshot OPTIONS is routed to the handler for CORS preflight', async () => {
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
      url: '/api/v1/snapshot',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'GET',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toBe('GET, OPTIONS');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('pricing route serves the pricing page instead of the SPA shell', async () => {
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
    const pricingLayerIndex = routeLayers.findIndex((layer) => layer.route.path === '/pricing');
    const catchAllLayerIndex = routeLayers.findIndex((layer) => layer.route.path === '*');

    expect(pricingLayerIndex).toBeGreaterThanOrEqual(0);
    expect(catchAllLayerIndex).toBeGreaterThanOrEqual(0);
    expect(pricingLayerIndex).toBeLessThan(catchAllLayerIndex);
  });
});
