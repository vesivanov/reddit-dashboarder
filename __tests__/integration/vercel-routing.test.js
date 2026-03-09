const { describe, test, expect } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

describe('vercel routing', () => {
  test('/pricing is routed to pricing.html before SPA fallback', () => {
    const vercelConfigPath = path.join(__dirname, '..', '..', 'vercel.json');
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const routes = Array.isArray(config.routes) ? config.routes : [];

    const pricingRouteIndex = routes.findIndex((route) => route.src === '/pricing/?' && route.dest === '/pricing.html');
    const appFallbackIndex = routes.findIndex((route) => route.src === '/(.*)' && route.dest === '/index.html');

    expect(pricingRouteIndex).toBeGreaterThanOrEqual(0);
    expect(appFallbackIndex).toBeGreaterThanOrEqual(0);
    expect(pricingRouteIndex).toBeLessThan(appFallbackIndex);
  });
});
