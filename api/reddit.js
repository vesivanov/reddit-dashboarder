// Vercel API Route — Reddit multi-day paginator + resilient fetching + CORS
// Usage example:
//   GET /api/reddit?subs=programming,technology&mode=new&days=3&limit=100&max_pages=30

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

function withCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(res).status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(res).status(405).json({ error: 'Method not allowed' });
  }

  const { subs, mode = 'new', time = 'day', days = '1', limit = '100', max_pages = '5' } = req.query;

  const subsArray = (subs || '').split(',').map(s => s.trim()).filter(Boolean);
  const modeValue = mode.toLowerCase();
  const daysValue = clampInt(days, 1, 7, 1);
  const limitValue = clampInt(limit, 25, 100, 100);
  const maxPagesValue = clampInt(max_pages, 1, 10, 5);

  if (!subsArray.length) {
    return withCORS(res).status(400).json({ error: 'Missing subs param' });
  }

  try {
    const cutoff = Math.floor(Date.now() / 1000) - daysValue * 86400;
    
    // Create tasks for each subreddit with concurrency control
    const tasks = subsArray.map(sub => async () => {
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

        if (modeValue === 'top') {
          const top = await fetchJSON(`https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limitValue}&raw_json=1`);
          return { subreddit: sub, meta, posts: normalize(top), partial: false };
        }

        // mode === 'new' with pagination + tiny delay between pages
        let after = '';
        let page = 0;
        const collected = [];
        while (page < maxPagesValue) {
          const ep = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=${limitValue}${after ? `&after=${after}` : ''}&raw_json=1`;
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
        const capped = page >= maxPagesValue;
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

    const responseData = {
      mode: modeValue,
      time,
      days: daysValue,
      limit: limitValue,
      max_pages: maxPagesValue,
      results,
      fetched_at: Date.now(),
    };

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    
    return withCORS(res).status(200).json(responseData);
  } catch (error) {
    console.error('API Error:', error);
    return withCORS(res).status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
