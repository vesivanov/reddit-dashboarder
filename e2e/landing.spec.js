// @ts-check
const { test, expect } = require('@playwright/test');

const LANDING = '/';

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LANDING);
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Reddit Dashboarder/);
  });

  test('renders hero headline', async ({ page }) => {
    await expect(page.locator('h1').first()).toContainText('Monitor Reddit');
  });

  test('hero CTA links to app', async ({ page }) => {
    const cta = page.getByRole('link', { name: /Open The App/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/app');
  });

  test('nav Open App link is present', async ({ page }) => {
    await expect(page.getByRole('navigation').getByRole('link', { name: /Open App/i })).toBeVisible();
  });

  test('root serves the marketing landing page instead of the app shell', async ({ page }) => {
    await expect(page.getByText('Monitor Reddit')).toBeVisible();
    await expect(page.getByText('Sign in with Reddit')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in with Reddit/i })).toHaveCount(0);
  });

  test('no italic text anywhere', async ({ page }) => {
    const italicElements = await page.$$('i, em');
    expect(italicElements).toHaveLength(0);
  });

  test('favicon is linked', async ({ page }) => {
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  });

  test('proof-led positioning sections are present', async ({ page }) => {
    const proof = page.getByText('Proof').first();
    await proof.scrollIntoViewIfNeeded();
    await expect(proof).toBeVisible();
    await expect(page.getByText('Why It Helps').first()).toBeVisible();
    await expect(page.getByText('Ideal For').first()).toBeVisible();
  });

  test('how it works section is present', async ({ page }) => {
    await expect(page.locator('#how-it-works')).toBeAttached();
    await expect(page.getByText('Connect your Reddit account')).toBeVisible();
  });

  test('footer has copyright and links', async ({ page }) => {
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('2026 Reddit Dashboarder');
    await expect(footer.getByRole('link', { name: 'GitHub' })).toBeVisible();
  });
});
