// @ts-check
const { test, expect } = require('@playwright/test');

function buildCoverageSummary(subreddit, { complete = false } = {}) {
  return {
    totalSubreddits: 1,
    complete1dCount: complete ? 1 : 0,
    complete3dCount: 0,
    complete5dCount: 0,
    totalPosts: complete ? 1 : 0,
    subreddits: [
      {
        subreddit,
        status: complete ? 'complete' : 'idle',
        next_after: '',
        cooldown_until: null,
        covered_through_utc: complete ? Math.floor(Date.now() / 1000) - 86400 : null,
        page_count: complete ? 1 : 0,
        post_count: complete ? 1 : 0,
        last_fetch_at: complete ? Date.now() : null,
        last_error: null,
        complete_1d: complete,
        complete_3d: false,
        complete_5d: false,
        inflight_until: null,
        meta: complete ? { title: `r/${subreddit}`, subscribers: 1234 } : null,
      },
    ],
  };
}

test.describe('Checkpointed fetch lifecycle', () => {
  test('keeps Refresh disabled until delayed coverage completion finishes', async ({ page }) => {
    const subreddit = 'programming';
    let advanceCalls = 0;

    await page.addInitScript((sub) => {
      localStorage.setItem('dashboard_onboarding_complete', '1');
      localStorage.setItem('dashboard_subs', JSON.stringify([sub]));
      localStorage.setItem('dashboard_subs_backup', JSON.stringify([sub]));
      localStorage.setItem('dashboard_auto_refresh_enabled', '0');
    }, subreddit);

    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) });
    });
    await page.route('**/api/settings/opportunity-config?*', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
    });
    await page.route('**/api/settings/openrouter-key', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasKey: false, source: 'none' }) });
    });
    await page.route('**/api/openrouter/models', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) });
    });
    await page.route('**/api/sync', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.route('**/api/reddit/coverage?*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            scopeId: 'scope_lifecycle',
            storage: { persistent: false, kind: 'memory' },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scopeId: 'scope_lifecycle',
          storage: { persistent: false, kind: 'memory' },
          summary: buildCoverageSummary(subreddit, { complete: false }),
          results: [],
        }),
      });
    });
    await page.route('**/api/reddit/advance', async (route) => {
      advanceCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          advanced: true,
          auth_mode: 'oauth',
          storage: { persistent: false, kind: 'memory' },
          summary: buildCoverageSummary(subreddit, { complete: true }),
          result: {
            subreddit,
            state: buildCoverageSummary(subreddit, { complete: true }).subreddits[0],
            posts: [
              {
                id: 'post-1',
                subreddit,
                title: 'Delayed checkpointed fetch works',
                selftext: 'body',
                score: 10,
                num_comments: 3,
                created_utc: Math.floor(Date.now() / 1000) - 60,
                permalink: `/r/${subreddit}/comments/post-1`,
                url: 'https://example.com/post-1',
                domain: 'example.com',
                author: 'tester',
                thumbnail: null,
                link_flair_text: '',
              },
            ],
          },
        }),
      });
    });
    await page.route('**/api/reddit/ai-rank', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ scores: {} }) });
    });

    await page.goto('/app');

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    const refreshButton = page.getByRole('button', { name: 'Refresh', exact: true });
    await refreshButton.click();

    await expect(refreshButton).toBeDisabled();
    await expect(page.getByText('Fetching…')).toBeVisible();

    await page.waitForTimeout(250);
    await expect(refreshButton).toBeDisabled();
    await expect(page.getByText('Fetching…')).toBeVisible();
    expect(advanceCalls).toBe(1);

    await expect(page.getByText('Delayed checkpointed fetch works')).toBeVisible();
    await expect(refreshButton).toBeEnabled();
    await expect(page.getByText('Storage')).toBeVisible();
    await expect(page.getByText('Memory')).toBeVisible();
  });
});
