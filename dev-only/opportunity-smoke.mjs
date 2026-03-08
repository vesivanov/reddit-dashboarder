import { chromium } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let persistedConfig = null;
  let lastSyncPayload = null;

  await page.addInitScript(() => {
    localStorage.setItem('dashboard_onboarding_complete', '1');
    localStorage.setItem('dashboard_subs', JSON.stringify(['seo']));
    localStorage.setItem('dashboard_subs_backup', JSON.stringify(['seo']));
    localStorage.setItem('dashboard_ai_enabled', '1');
  });

  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) });
  });
  await page.route('**/api/settings/openrouter-key', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasKey: false, keyPreview: null, source: 'none' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/openrouter/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', context_length: 128000 }],
      }),
    });
  });
  await page.route('**/api/settings/opportunity-config**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (!persistedConfig) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No opportunity config found' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, config: persistedConfig }) });
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, config: persistedConfig }) });
  });
  await page.route('**/api/sync', async (route) => {
    if (route.request().method() === 'POST') {
      lastSyncPayload = JSON.parse(route.request().postData() || '{}');
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, token: 'sync-smoke-token' }) });
  });
  await page.route('**/api/reddit**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fetched_at: Date.now(),
        snapshot: { cached: false, age_seconds: 0 },
        results: [{
          subreddit: 'seo',
          meta: { subscribers: 100000, title: 'SEO' },
          posts: [{
            id: 'p1',
            title: 'Traffic dropped after redesign, need SEO help urgently',
            selftext: 'Founder here, looking for help fixing rankings this week.',
            subreddit: 'seo',
            author: 'founder1',
            score: 18,
            num_comments: 6,
            created_utc: Math.floor(Date.now() / 1000) - 3600,
            reddit_url: 'https://reddit.com/r/seo/comments/p1',
          }],
        }],
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
        metadata: { p1: { confidence: 'high', reason: 'Business owner with urgent commercial pain and strong fit.' } },
        opportunities: {
          p1: {
            classification: { type: 'lead', confidence: 0.92 },
            scores: { priority: 0.88, replyLikelihood: 0.81, clientConversionLikelihood: 0.84 },
            action: { recommended: 'reply_now', reason: 'Reply now while the thread is active.' },
            explanation: { summary: 'Founder asking for urgent SEO help after a traffic drop.', bullets: ['strong commercial intent'] },
          },
        },
      }),
    });
  });

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[browser:${type}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    console.log(`[pageerror] ${error.message}`);
  });

  try {
    console.log('Opening app');
    await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    console.log('Checking authenticated shell');
    await page.waitForFunction(() => {
      const rootText = document.body?.innerText || '';
      return rootText.includes('Reddit Dashboarder') || rootText.includes('Reddit Dashboard');
    }, { timeout: 10000 });
    await page.waitForFunction(() => {
      const rootText = document.body?.innerText || '';
      return !rootText.includes('Loading...');
    }, { timeout: 10000 });
    const authButtons = await page.locator('button').evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim()).filter(Boolean)
    );
    console.log(`Visible buttons: ${JSON.stringify(authButtons)}`);
    if (authButtons.includes('Sign in') || authButtons.includes('Sign in with Reddit')) {
      throw new Error('App still rendered unauthenticated shell after mocked auth status');
    }
    await page.getByTitle('Settings').waitFor({ timeout: 10000 });

    console.log('Opening settings');
    await page.getByTitle('Settings').click();
    await page.getByText('Opportunity Engine', { exact: true }).waitFor({ timeout: 10000 });

    const offeringInput = page.getByLabel('What do you sell?');
    if (await offeringInput.isDisabled()) {
      await page.getByTitle(/Enable opportunity engine|Disable opportunity engine/).last().click();
      await page.waitForTimeout(300);
    }

    console.log('Saving settings');
    await offeringInput.fill('SEO consulting for SaaS teams');
    await page.getByLabel('Ideal customer').fill('Founders and marketing leads');
    await page.getByLabel('Problems you solve').fill('Traffic drops and weak search visibility');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.waitForTimeout(1200);

    if (persistedConfig?.opportunityConfig?.businessOffering !== 'SEO consulting for SaaS teams') {
      throw new Error('Settings were not persisted through mocked opportunity-config endpoint');
    }

    console.log('Fetching posts');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByText('Traffic dropped after redesign, need SEO help urgently').waitFor({ timeout: 10000 });

    console.log('Running opportunity scan');
    const rankingButton = page.getByRole('button', { name: /Run opportunity scan|Refresh ranking/ });
    await rankingButton.click();
    await page.getByText('P88').waitFor({ timeout: 10000 });
    await page.getByText('lead').first().waitFor({ timeout: 10000 });

    if (lastSyncPayload?.settings?.opportunityConfig?.businessOffering !== 'SEO consulting for SaaS teams') {
      throw new Error('Synced payload did not include persisted opportunity config');
    }

    console.log('Reloading for rehydration check');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText('Traffic dropped after redesign, need SEO help urgently').waitFor({ timeout: 10000 });
    await page.getByTitle('Settings').click();
    const value = await page.getByLabel('What do you sell?').inputValue();
    if (value !== 'SEO consulting for SaaS teams') {
      throw new Error(`Rehydrated settings mismatch: expected business offering to persist, got "${value}"`);
    }

    console.log('Smoke test passed');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
