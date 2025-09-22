// Cloudflare Worker v5 — Reddit multi-day paginator + resilient fetching + CORS
// Usage example:
//   GET /api?subs=programming,technology&mode=new&days=3&limit=100&max_pages=30
// Notes:
//   - Use mode=new for time-complete coverage (paginates until cutoff or page cap)
//   - days: 1 | 3 | 7 (clamped to 1..7)
//   - limit: 5..25 (Reddit max page size is ~100, but we use smaller for stability)
//   - max_pages default 2 (safety cap per subreddit). Increase carefully if needed.

// Polite User-Agent + small retry/backoff helper
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, { tries = 3, baseDelay = 400 } = {}) {
  let attempt = 0, lastErr;
  while (attempt < tries) {
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(url, { 
        headers: { 'User-Agent': UA },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const text = await res.text(); // Reddit sometimes returns HTML rate pages
      
      // Handle rate limiting specifically
      if (res.status === 429) {
        throw new Error(`Rate limited by Reddit: ${text.slice(0,120)}`);
      }
      
      if (!res.ok) throw new Error(`Upstream ${res.status}: ${text.slice(0,120)}`);
      
      // Check if response is HTML (rate limit page)
      if (text.includes('Too Many Requests') || text.includes('<!doctype html>')) {
        throw new Error('Reddit is rate limiting requests. Please wait a few minutes and try again. Consider using Reddit OAuth for higher limits.');
      }
      
      // try parse JSON
      try { return JSON.parse(text); } catch { throw new Error('Invalid JSON body'); }
    } catch (e) {
      lastErr = e;
      attempt++;
      // backoff with jitter (esp. on 429/5xx)
      const delay = baseDelay * Math.pow(2, attempt-1) + Math.random()*250;
      await sleep(delay);
    }
  }
  throw lastErr || new Error('fetchJSON failed');
}

// run a list of async tasks with limited concurrency
async function runWithConcurrency(tasks, limit = 3) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = await tasks[i](); }
      catch (e) { results[i] = { error: e.message }; }
    }
  }
  const pool = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(pool);
  return results;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return withCORS(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api') {
      return withCORS(new Response('Not Found', { status: 404 }));
    }

    const subs = (url.searchParams.get('subs') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const mode = (url.searchParams.get('mode') || 'new').toLowerCase();
    const time = url.searchParams.get('time') || 'day';
    const days = clampInt(url.searchParams.get('days'), 1, 7, 1);
    const limit = clampInt(url.searchParams.get('limit'), 25, 100, 100);
    const maxPages = clampInt(url.searchParams.get('max_pages'), 1, 10, 5);

    if (!subs.length) {
      return respond({ error: 'Missing subs param' }, 400);
    }

    const sortedSubs = [...subs].sort();
    // Temporarily disabled caching to test
    // const cacheUrl = new URL(request.url);
    // cacheUrl.searchParams.set('subs', sortedSubs.join(','));
    // const cacheKey = new Request(cacheUrl.toString(), request);
    // const cache = caches.default;
    // const cached = await cache.match(cacheKey);
    // if (cached) {
    //   return withCORS(cached);
    // }

    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    
    // Create tasks for each subreddit with concurrency control
    const tasks = subs.map(sub => async () => {
      try {
        // meta (about.json)
        const about = await fetchJSON(`https://www.reddit.com/r/${encodeURIComponent(sub)}/about.json`);
        const meta = about?.data ? {
          subscribers: about.data.subscribers || null,
          active_user_count: about.data.active_user_count || about.data.accounts_active || null,
          title: about.data.title || null,
          icon_img: about.data.icon_img || null,
          description: about.data.public_description || about.data.description || '',
        } : null;

        if (mode === 'top') {
          const top = await fetchJSON(`https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limit}&raw_json=1`);
          return { subreddit: sub, meta, posts: normalize(top), partial: false };
        }

        // mode === 'new' with pagination + tiny delay between pages
        let after = '';
        let page = 0;
        const collected = [];
        while (page < maxPages) {
          const ep = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=${limit}${after ? `&after=${after}` : ''}&raw_json=1`;
          const json = await fetchJSON(ep);
          const posts = normalize(json);
          if (!posts.length) break;

          for (const p of posts) if ((p.created_utc || 0) >= cutoff) collected.push(p);

          after = json?.data?.after || '';
          page += 1;

          const oldest = posts[posts.length - 1];
          if (!after || !oldest || oldest.created_utc < cutoff) break;

          // small pause to be nice to Reddit
          await sleep(250 + Math.random() * 250);
        }
        const capped = page >= maxPages;
        let partial = false;
        if (capped && collected.length) {
          const oldest = collected[collected.length - 1];
          if ((oldest.created_utc || 0) >= cutoff) partial = true;
        }
        return { subreddit: sub, meta, posts: collected, partial };
      } catch (e) {
        return { subreddit: sub, error: e.message, posts: [], partial: false };
      }
    });

    const perSubResults = await runWithConcurrency(tasks, 3);
    const results = perSubResults;

    const body = JSON.stringify({
      mode,
      time,
      days,
      limit,
      max_pages: maxPages,
      results,
      fetched_at: Date.now(),
    });

    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=600',
      },
    });
    // ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withCORS(response);
  },
};


function normalize(data) {
  const children = data?.data?.children || [];
  return children.map(child => {
    const post = child.data || {};
    return {
      id: post.id,
      subreddit: post.subreddit,
      title: post.title,
      selftext: post.selftext || '',
      selftext_html: post.selftext_html || '',
      author: post.author,
      url: `https://www.reddit.com${post.permalink}`,
      domain: post.domain,
      score: post.score,
      num_comments: post.num_comments,
      created_utc: post.created_utc,
      thumbnail: validThumb(post.thumbnail) ? post.thumbnail : null,
    };
  });
}

function validThumb(thumbnail) {
  if (!thumbnail) return false;
  return !['self', 'default', 'nsfw', 'image', 'spoiler'].includes(thumbnail);
}

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value || '', 10);
  if (Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, parsed));
  }
  return fallback;
}

function withCORS(resp) {
  const headers = new Headers(resp.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(resp.body, { status: resp.status, headers });
}

function respond(obj, status = 200) {
  return withCORS(new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}
