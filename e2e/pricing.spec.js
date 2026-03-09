// @ts-check
const { test, expect } = require('@playwright/test');

const PRICING = '/pricing';

test.describe('Pricing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRICING);
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Pricing.*Reddit Dashboarder/);
  });

  test('shows Free and Pro tiers', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Free Forever' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  });

  test('prices render in monospace', async ({ page }) => {
    const freePrice = page.locator('.font-mono').filter({ hasText: '$0' });
    const proPrice  = page.locator('.font-mono').filter({ hasText: '$29' });
    await expect(freePrice).toBeVisible();
    await expect(proPrice).toBeVisible();
  });

  test('primary pricing CTAs stay on marketing routes', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Back Home →' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'View Overview →' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Back to Overview →' })).toHaveAttribute('href', '/');
  });

  test('FAQ section is present', async ({ page }) => {
    await expect(page.getByText('Can I switch plans later?')).toBeVisible();
  });

  test('favicon is linked', async ({ page }) => {
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  });

  test('nav wordmark links to home', async ({ page }) => {
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Reddit Dashboarder' })
    ).toHaveAttribute('href', '/');
  });

  test('no italic text anywhere', async ({ page }) => {
    const italicElements = await page.$$('i, em');
    expect(italicElements).toHaveLength(0);
  });
});
