// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Opportunity dashboard smoke', () => {
  test('persists settings, fetches posts, ranks opportunities, and rehydrates after reload', async ({ page }) => {
    /** @type {any | null} */
    let persistedConfig = null;
    /** @type {any | null} */
    let lastSyncPayload = null;
    const workspaceId = 'ws_smoke';
    const coverageSummary = {
      totalSubreddits: 1,
      complete1dCount: 0,
      complete3dCount: 0,
      complete5dCount: 0,
      totalPosts: 0,
      subreddits: [
        {
          subreddit: 'seo',
          status: 'idle',
          next_after: '',
          cooldown_until: null,
          covered_through_utc: null,
          page_count: 0,
          post_count: 0,
          last_fetch_at: null,
          last_error: null,
          complete_1d: false,
          complete_3d: false,
          complete_5d: false,
          inflight_until: null,
          meta: null,
        },
      ],
    };

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

    async function fulfillConfig(route, mode) {
      const request = route.request();
      if (request.method() === 'GET') {
        if (!persistedConfig) {
          if (mode === 'workspace') {
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({
                schemaVersion: '1.0.0',
                requestId: 'req_test',
                timings: { totalMs: 0 },
                data: null,
                error: { code: 'NOT_FOUND', message: 'No configuration found' },
              }),
            });
          } else {
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'No opportunity config found' }),
            });
          }
          return;
        }

        if (mode === 'workspace') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              schemaVersion: '1.0.0',
              requestId: 'req_test',
              timings: { totalMs: 0 },
              data: { config: persistedConfig },
              error: null,
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, config: persistedConfig }),
          });
        }
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

      if (mode === 'workspace') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schemaVersion: '1.0.0',
            requestId: 'req_test',
            timings: { totalMs: 0 },
            data: {
              config: {
                workspaceId,
                filters: {},
                ...persistedConfig,
              },
            },
            error: null,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, config: persistedConfig }),
        });
      }
    }

    await page.route('**/api/workspaces', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, workspaceId, token: 'sync-smoke-token' }),
      });
    });

    await page.route('**/api/workspaces/*/config', async (route) => {
      await fulfillConfig(route, 'workspace');
    });

    await page.route('**/api/workspaces/*/snapshot', async (route) => {
      const request = route.request();
      if (request.method() === 'PUT') {
        lastSyncPayload = JSON.parse(request.postData() || '{}');
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, workspaceId }),
      });
    });

    await page.route('**/api/reddit/snapshot?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          auth_mode: 'oauth',
          storage: { persistent: false, kind: 'memory' },
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
                  permalink: '/r/seo/comments/p1/traffic_drop',
                  reddit_url: 'https://reddit.com/r/seo/comments/p1/traffic_drop',
                  url: 'https://reddit.com/r/seo/comments/p1/traffic_drop',
                  domain: 'self.seo',
                  thumbnail: null,
                  link_flair_text: 'Question',
                },
              ],
              partial: false,
              coverage_state: {
                subreddit: 'seo',
                status: 'complete',
                next_after: null,
                cooldown_until: null,
                covered_through_utc: Math.floor(Date.now() / 1000) - 86400,
                page_count: 1,
                post_count: 1,
                last_fetch_at: Date.now(),
                last_error: null,
                complete_1d: true,
                complete_3d: false,
                complete_5d: false,
                inflight_until: null,
                meta: { subscribers: 100000, title: 'SEO' },
              },
              error: null,
            },
          ],
          fetched_at: Date.now(),
          request_capped: false,
          rate_limited: false,
          rate_limited_subreddits: [],
          timed_out: false,
          timed_out_subreddits: [],
          coverage_summary: {
            complete1dCount: 1,
            complete3dCount: 0,
            complete5dCount: 0,
          },
          metrics: {
            subredditCount: 1,
            totalPosts: 1,
            rateLimitedCount: 0,
            durationMs: 50,
            timedOutCount: 0,
            retryAfterSeconds: 0,
            redditRequestCount: 1,
            sharedCooldownHit: false,
            requestCapped: false,
          },
          snapshot: {
            cached: false,
            stale: false,
            age_seconds: 0,
            ttl_seconds: 120,
            key: 'smoke',
            cacheable: true,
          },
        }),
      });
    });

    await page.route('**/api/reddit/coverage?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scopeId: 'scope_smoke',
          storage: { persistent: false, kind: 'memory' },
          summary: coverageSummary,
          results: [],
        }),
      });
    });

    await page.route('**/api/reddit/advance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          advanced: true,
          auth_mode: 'oauth',
          storage: { persistent: false, kind: 'memory' },
          summary: {
            totalSubreddits: 1,
            complete1dCount: 1,
            complete3dCount: 0,
            complete5dCount: 0,
            totalPosts: 1,
            subreddits: [
              {
                ...coverageSummary.subreddits[0],
                status: 'complete',
                page_count: 1,
                post_count: 1,
                last_fetch_at: Date.now(),
                complete_1d: true,
                meta: { subscribers: 100000, title: 'SEO' },
              },
            ],
          },
          result: {
            subreddit: 'seo',
            state: {
              ...coverageSummary.subreddits[0],
              status: 'complete',
              page_count: 1,
              post_count: 1,
              last_fetch_at: Date.now(),
              complete_1d: true,
              meta: { subscribers: 100000, title: 'SEO' },
            },
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
                permalink: '/r/seo/comments/p1',
                url: 'https://reddit.com/r/seo/comments/p1',
                domain: 'reddit.com',
                thumbnail: null,
                link_flair_text: '',
              },
            ],
          },
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
    await expect(page.getByText('Opportunity Engine', { exact: true })).toBeVisible();

    const engineToggle = page.getByTitle(/Enable opportunity engine|Disable opportunity engine/).last();
    const offeringInput = page.getByLabel('What do you sell?');
    if (await offeringInput.isDisabled()) {
      await engineToggle.click();
    }

    await offeringInput.fill('SEO consulting for SaaS teams');
    await page.getByLabel('Ideal customer').fill('Founders and marketing leads');
    await page.getByLabel('Problems you solve').fill('Traffic drops and weak search visibility');
    await page.locator('textarea').filter({ hasText: '' }).last().fill('Prioritize urgent commercial threads.');

    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(900);

    await expect.poll(() => persistedConfig?.opportunityConfig?.businessOffering || '').toBe('SEO consulting for SaaS teams');

    await page.getByLabel('Refresh posts').click();
    await expect(page.getByText('Traffic dropped after redesign, need SEO help urgently')).toBeVisible();

    await page.getByRole('button', { name: 'Refresh ranking' }).click();
    await expect(page.getByText('lead').first()).toBeVisible();
    await expect(page.getByText('reply now').first()).toBeVisible();
    await expect(page.getByText('P88')).toBeVisible();

    await expect.poll(() => {
      return lastSyncPayload?.settings?.opportunityConfig?.businessOffering || '';
    }).toBe('SEO consulting for SaaS teams');

    const routeChecks = await page.evaluate(async () => {
      const headers = { Authorization: 'Bearer smoke-key' };
      const results = await Promise.all([
        fetch('/api/workspaces/ws_smoke/config').then(async (res) => ({ status: res.status, body: await res.json() })),
        fetch('/api/workspaces/ws_smoke/snapshot', {
          method: 'PUT',
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

  test('reloads workspace config after a version conflict and retries with the latest ETag', async ({ page }) => {
    const workspaceId = 'ws_conflict';
    let configGetCount = 0;
    /** @type {Array<{ ifMatch: string | null, body: any }>} */
    const patchRequests = [];
    let persistedConfig = {
      workspaceId,
      subreddits: ['seo'],
      filters: {},
      goals: 'Old goal',
      aiContext: '',
      aiPrompt: 'Old goal',
      opportunityConfig: {
        businessOffering: 'Old SEO offer',
        idealCustomer: '',
        problemsSolved: '',
        preferredEngagement: 'reply',
        strategyPreset: 'balanced',
        opportunityTypes: ['lead', 'pain_point', 'tool_search'],
        strictness: 'balanced',
      },
      scoringConfig: {
        lookingFor: 'Old goal',
        avoid: '',
        examples: {
          perfect: '',
          strong: '',
          reject: '',
        },
      },
      threshold: 4,
      model: 'openai/gpt-4o-mini',
      version: 5,
      updatedAt: '2026-03-14T14:00:00.000Z',
    };

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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hasKey: false, keyPreview: null, source: 'none' }),
      });
    });

    await page.route('**/api/openrouter/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [] }),
      });
    });

    await page.route('**/api/workspaces', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, workspaceId, token: 'sync-conflict-token' }),
      });
    });

    await page.route('**/api/workspaces/*/config', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        configGetCount += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schemaVersion: '1.0.0',
            requestId: `req_conflict_${configGetCount}`,
            timings: { totalMs: 0 },
            data: { config: persistedConfig },
            error: null,
          }),
        });
        return;
      }

      const body = JSON.parse(request.postData() || '{}');
      patchRequests.push({
        ifMatch: request.headers()['if-match'] || null,
        body,
      });

      if (patchRequests.length === 1) {
        persistedConfig = {
          ...persistedConfig,
          version: 6,
          updatedAt: '2026-03-14T14:01:00.000Z',
        };
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            schemaVersion: '1.0.0',
            requestId: 'req_conflict_409',
            timings: { totalMs: 0 },
            data: null,
            error: {
              code: 'VERSION_CONFLICT',
              message: 'Configuration version conflict',
              details: [
                { field: 'version', message: 'Expected 6 but received 5' },
              ],
            },
          }),
        });
        return;
      }

      persistedConfig = {
        ...persistedConfig,
        subreddits: body.subreddits,
        goals: body.goals,
        aiContext: body.aiContext,
        aiPrompt: body.aiPrompt,
        opportunityConfig: body.opportunityConfig,
        scoringConfig: body.scoringConfig,
        threshold: body.threshold,
        model: body.model,
        version: 7,
        updatedAt: '2026-03-14T14:02:00.000Z',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: '1.0.0',
          requestId: 'req_conflict_200',
          timings: { totalMs: 0 },
          data: { config: persistedConfig },
          error: null,
        }),
      });
    });

    await page.goto('/app');

    await expect(page.getByRole('button', { name: 'Edit AI' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit AI' }).click();
    await page.getByLabel('What do you sell?').fill('SEO consulting');

    await expect.poll(() => patchRequests.length).toBe(2);
    await expect.poll(() => configGetCount >= 2).toBe(true);
    await expect.poll(() => persistedConfig.opportunityConfig.businessOffering).toBe('SEO consulting');
    expect(patchRequests.map((entry) => entry.ifMatch)).toEqual(['5', '6']);

    await page.waitForTimeout(3000);
    expect(patchRequests).toHaveLength(2);
  });
});
