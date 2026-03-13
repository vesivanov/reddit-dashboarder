const { describe, test, expect } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

describe('vercel routing', () => {
  test('/app is routed to the SPA shell before the generic fallback', () => {
    const vercelConfigPath = path.join(__dirname, '..', '..', 'vercel.json');
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const routes = Array.isArray(config.routes) ? config.routes : [];

    const appRouteIndex = routes.findIndex((route) => route.src === '/app' && route.dest === '/index.html');
    const appFallbackIndex = routes.findIndex((route) => route.src === '/(.*)' && route.dest === '/index.html');

    expect(appRouteIndex).toBeGreaterThanOrEqual(0);
    expect(appFallbackIndex).toBeGreaterThanOrEqual(0);
    expect(appRouteIndex).toBeLessThan(appFallbackIndex);
  });
});
