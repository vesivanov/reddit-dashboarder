// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Opportunity dashboard smoke', () => {
  test('persists settings, fetches posts, ranks opportunities, and rehydrates after reload', async ({ page }) => {
    /** @type {any | null} */
    let persistedConfig = null;
    /** @type {any | null} */
    let lastSyncPayload = null;

    await page.addInitScript(() => {
      localStorage.setItem('dashboard_onboarding_complete', '1');
      localStorage.setItem('dashboard_subs', JSON.stringify(['seo']));
      localStorage.setItem('dashboard_subs_backup', JSON.stringify(['seo']));
      localStorage.setItem('dashboard_ai_enabled', '1');
    });

    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true }),
      });
    });

    await page.route('**/api/settings/openrouter-key', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ hasKey: false, keyPreview: null, source: 'none' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, keyPreview: 'test***' }),
      });
    });

    await page.route('**/api/openrouter/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              id: 'openai/gpt-4o-mini',
              name: 'GPT-4o mini',
              context_length: 128000,
              description: 'Fast model for opportunity ranking',
              pricing: { prompt: '0', completion: '0' },
            },
          ],
        }),
      });
    });

    await page.route('**/api/settings/opportunity-config**', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        if (!persistedConfig) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'No opportunity config found' }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, config: persistedConfig }),
        });
        return;
      }

      const body = JSON.parse(request.postData() || '{}');
      persistedConfig = {
        subreddits: body.subreddits || ['seo'],
        goals: body.goals || '',
        aiContext: body.aiContext || '',
        aiPrompt: body.aiPrompt || '',
        opportunityConfig: body.opportunityConfig || null,
        scoringConfig: body.scoringConfig || null,
        threshold: body.threshold ?? 4,
        model: body.model || 'openai/gpt-4o-mini',
        version: (persistedConfig?.version || 0) + 1,
        updatedAt: new Date().toISOString(),
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, config: persistedConfig }),
      });
    });

    await page.route('**/api/sync', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        lastSyncPayload = JSON.parse(request.postData() || '{}');
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, token: 'sync-smoke-token' }),
      });
    });

    await page.route('**/api/reddit?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fetched_at: Date.now(),
          snapshot: { cached: false, age_seconds: 0 },
          results: [
            {
              subreddit: 'seo',
              meta: { subscribers: 100000, title: 'SEO' },
              posts: [
                {
                  id: 'p1',
                  title: 'Traffic dropped after redesign, need SEO help urgently',
                  selftext: 'Founder here, looking for help fixing rankings this week.',
                  subreddit: 'seo',
                  author: 'founder1',
                  score: 18,
                  num_comments: 6,
                  created_utc: Math.floor(Date.now() / 1000) - 3600,
                  reddit_url: 'https://reddit.com/r/seo/comments/p1',
                },
              ],
            },
          ],
        }),
      });
    });

    await page.route('**/api/reddit/ai-rank', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          promptVersion: 'v5.0',
          scores: { p1: 5 },
          metadata: {
            p1: {
              confidence: 'high',
              reason: 'Business owner with urgent commercial pain and strong fit.',
            },
          },
          opportunities: {
            p1: {
              classification: { type: 'lead', confidence: 0.92 },
              scores: {
                priority: 0.88,
                replyLikelihood: 0.81,
                clientConversionLikelihood: 0.84,
              },
              action: {
                recommended: 'reply_now',
                reason: 'Reply now while the thread is active.',
              },
              explanation: {
                summary: 'Founder asking for urgent SEO help after a traffic drop.',
                bullets: ['strong commercial intent', 'urgent problem', 'recent and actionable'],
              },
            },
          },
        }),
      });
    });

    await page.goto('/app');

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.getByTitle('Settings').click();
    await expect(page.getByText('Opportunity Engine')).toBeVisible();

    const engineToggle = page.getByTitle(/Enable opportunity engine|Disable opportunity engine/).last();
    const offeringInput = page.getByLabel('What do you sell?');
    if (await offeringInput.isDisabled()) {
      await engineToggle.click();
    }

    await offeringInput.fill('SEO consulting for SaaS teams');
    await page.getByLabel('Ideal customer').fill('Founders and marketing leads');
    await page.getByLabel('Problems you solve').fill('Traffic drops and weak search visibility');
    await page.locator('textarea').filter({ hasText: '' }).last().fill('Prioritize urgent commercial threads.');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);

    await expect.poll(() => persistedConfig?.opportunityConfig?.businessOffering || '').toBe('SEO consulting for SaaS teams');

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Traffic dropped after redesign, need SEO help urgently')).toBeVisible();

    await page.getByRole('button', { name: 'Run opportunity scan' }).click();
    await expect(page.getByText('lead').first()).toBeVisible();
    await expect(page.getByText('reply now').first()).toBeVisible();
    await expect(page.getByText('P88')).toBeVisible();

    await expect.poll(() => {
      return lastSyncPayload?.settings?.opportunityConfig?.businessOffering || '';
    }).toBe('SEO consulting for SaaS teams');

    const routeChecks = await page.evaluate(async () => {
      const headers = { Authorization: 'Bearer smoke-key' };
      const results = await Promise.all([
        fetch('/api/settings/opportunity-config?token=sync-smoke-token').then(async (res) => ({ status: res.status, body: await res.json() })),
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'sync-smoke-token', posts: [], settings: {}, filters: {}, timestamp: new Date().toISOString() }),
        }).then(async (res) => ({ status: res.status, body: await res.json() })),
        fetch('/api/reddit/ai-rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posts: [], userGoals: 'test', openRouterModel: 'openai/gpt-4o-mini' }),
        }).then(async (res) => ({ status: res.status, body: await res.json() })),
      ]);
      return results;
    });

    expect(routeChecks[0].status).toBe(200);
    expect(routeChecks[1].status).toBe(200);
    expect(routeChecks[2].status).toBe(200);

    await page.reload();
    await expect(page.getByText('Traffic dropped after redesign, need SEO help urgently')).toBeVisible();

    await page.getByTitle('Settings').click();
    await expect(page.getByLabel('What do you sell?')).toHaveValue('SEO consulting for SaaS teams');
    await expect(page.getByLabel('Ideal customer')).toHaveValue('Founders and marketing leads');
  });
});
