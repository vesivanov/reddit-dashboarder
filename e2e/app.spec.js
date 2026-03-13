// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Dashboard app', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('shows login screen when unauthenticated', async ({ page }) => {
    // Login overlay should be visible
    await expect(page.getByText('Sign in with Reddit')).toBeVisible();
  });

  test('sign in button links to Reddit OAuth', async ({ page }) => {
    const btn = page.getByRole('button', { name: /Sign in with Reddit/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect.poll(() => {
      const url = new URL(page.url());
      return `${url.hostname}${url.pathname}`;
    }).toMatch(/www\.reddit\.com\/(login\/|api\/v1\/authorize)/);
  });

  test('favicon is linked', async ({ page }) => {
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  });
});

test.describe('Dashboard app — health', () => {
  test('API health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok' });
  });

  test('auth status endpoint is reachable', async ({ request }) => {
    const res = await request.get('/api/auth/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('authenticated');
  });
});
