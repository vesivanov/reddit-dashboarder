// Vercel API Route — Reddit multi-day paginator + resilient fetching + CORS
// Usage example:
//   GET /api/reddit?subs=programming,technology&mode=new&days=3&limit=100&max_pages=30

// More realistic User-Agent to avoid Reddit blocking
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, { tries = 3, baseDelay = 400 } = {}) {
  let attempt = 0, lastErr;
  console.log(`fetchJSON: Starting request to ${url} (max ${tries} tries)`);
  
  while (attempt < tries) {
    try {
      console.log(`fetchJSON: Attempt ${attempt + 1}/${tries} for ${url}`);
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(url, { 
        headers: { 
          'User-Agent': UA,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      console.log(`fetchJSON: Got response ${res.status} ${res.statusText} for ${url}`);
      
      const text = await res.text(); // Reddit sometimes returns HTML rate pages
      console.log(`fetchJSON: Response body length: ${text.length} chars`);
      
      // Handle rate limiting specifically
      if (res.status === 429) {
        const errorMsg = `[RATE_LIMIT] Rate limited by Reddit: ${text.slice(0,120)}`;
        console.error(`fetchJSON: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // Handle 403 Forbidden (Reddit blocking)
      if (res.status === 403) {
        const errorMsg = `[RATE_LIMIT] Reddit is blocking requests (403 Forbidden). This is likely due to rate limiting or IP restrictions. Try again later or use Reddit OAuth for higher limits.`;
        console.error(`fetchJSON: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      if (!res.ok) {
        const errorMsg = `Upstream ${res.status}: ${text.slice(0,120)}`;
        console.error(`fetchJSON: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // Check if response is HTML (rate limit page)
      if (text.includes('Too Many Requests') || text.includes('<!doctype html>')) {
        const errorMsg = '[RATE_LIMIT] Reddit is rate limiting requests. Please wait a few minutes and try again. Consider using Reddit OAuth for higher limits.';
        console.error(`fetchJSON: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // try parse JSON
      try { 
        const json = JSON.parse(text);
        console.log(`fetchJSON: Successfully parsed JSON for ${url}`);
        return json;
      } catch { 
        const errorMsg = 'Invalid JSON body';
        console.error(`fetchJSON: ${errorMsg}. Body preview: ${text.slice(0, 200)}`);
        throw new Error(errorMsg);
      }
    } catch (e) {
      lastErr = e;
      attempt++;
      console.error(`fetchJSON: Attempt ${attempt} failed for ${url}:`, e.message);
      
      if (attempt < tries) {
        // backoff with jitter (esp. on 429/5xx)
        const delay = baseDelay * Math.pow(2, attempt-1) + Math.random()*250;
        console.log(`fetchJSON: Waiting ${Math.round(delay)}ms before retry ${attempt + 1}/${tries}`);
        await sleep(delay);
      }
    }
  }
  console.error(`fetchJSON: All ${tries} attempts failed for ${url}`);
  throw lastErr || new Error('fetchJSON failed');
}

// run a list of async tasks with limited concurrency and delays
async function runWithConcurrency(tasks, limit = 3) { // Slightly higher concurrency to reduce total time
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try { 
        // Add delay between subreddit requests to avoid rate limiting
        if (i > 0) {
          await sleep(300 + Math.random() * 300);
        }
        results[i] = await tasks[i](); 
      }
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

async function handler(req, res) {
  // Add comprehensive logging
  console.log('=== API Request Started ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Query:', req.query);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Timestamp:', new Date().toISOString());
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return withCORS(res).status(204).end();
  }

  if (req.method !== 'GET') {
    console.log('Method not allowed:', req.method);
    return withCORS(res).status(405).json({ error: 'Method not allowed' });
  }

  const { subs, mode = 'new', time = 'day', days = '1', limit = '100', max_pages = '5' } = req.query;
  console.log('Parsed parameters:', { subs, mode, time, days, limit, max_pages });

  const subsArray = (subs || '').split(',').map(s => s.trim()).filter(Boolean);
  const modeValue = mode.toLowerCase();
  const daysValue = clampInt(days, 1, 7, 1);
  const limitValue = clampInt(limit, 25, 100, 100);
  const maxPagesValue = clampInt(max_pages, 1, 10, 5);

  console.log('Processed parameters:', { 
    subsArray, 
    modeValue, 
    daysValue, 
    limitValue, 
    maxPagesValue 
  });

  if (!subsArray.length) {
    console.log('Error: No subreddits provided');
    return withCORS(res).status(400).json({ error: 'Missing subs param' });
  }

  try {
    const cutoff = Math.floor(Date.now() / 1000) - daysValue * 86400;
    console.log('Starting data fetch with cutoff timestamp:', cutoff, 'for', subsArray.length, 'subreddits');
    
    // Create tasks for each subreddit with concurrency control
    const tasks = subsArray.map(sub => async () => {
      console.log(`Starting fetch for subreddit: r/${sub}`);
      try {
        // Skip metadata fetching to avoid 403 errors - just use basic info
        const meta = {
          subscribers: null,
          active_user_count: null,
          title: `r/${sub}`,
          icon_img: null,
          description: '',
        };

        if (modeValue === 'top') {
          console.log(`Fetching top posts for r/${sub} with time=${time}, limit=${limitValue}`);
          // Try multiple endpoints - some might be less blocked
          let posts = [];
          const endpoints = [
            `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limitValue}&raw_json=1`,
            `https://www.reddit.com/r/${encodeURIComponent(sub)}.json?sort=top&t=${encodeURIComponent(time)}&limit=${limitValue}`,
            `https://old.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${encodeURIComponent(time)}&limit=${limitValue}`
          ];
          
          for (const endpoint of endpoints) {
            try {
              console.log(`Trying endpoint: ${endpoint}`);
              const top = await fetchJSON(endpoint);
              posts = normalize(top);
              if (posts.length > 0) {
                console.log(`Got ${posts.length} top posts for r/${sub} from ${endpoint}`);
                break;
              }
            } catch (e) {
              console.log(`Endpoint failed: ${endpoint} - ${e.message}`);
              continue;
            }
          }
          return { subreddit: sub, meta, posts, partial: false };
        }

        // mode === 'new' with pagination - try multiple endpoints
        console.log(`Fetching new posts for r/${sub} with pagination (max ${maxPagesValue} pages)`);
        let after = '';
        let page = 0;
        const collected = [];
        
        // Try different endpoints for new posts
        const baseEndpoints = [
          `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json`,
          `https://www.reddit.com/r/${encodeURIComponent(sub)}.json`,
          `https://old.reddit.com/r/${encodeURIComponent(sub)}/new.json`
        ];
        
        let workingEndpoint = null;
        for (const baseEp of baseEndpoints) {
          try {
            const testEp = `${baseEp}?limit=1&raw_json=1`;
            console.log(`Testing endpoint: ${testEp}`);
            await fetchJSON(testEp);
            workingEndpoint = baseEp;
            console.log(`Found working endpoint: ${baseEp}`);
            break;
          } catch (e) {
            console.log(`Endpoint failed: ${baseEp} - ${e.message}`);
            continue;
          }
        }
        
        if (!workingEndpoint) {
          throw new Error('All Reddit endpoints are blocked');
        }
        
        while (page < maxPagesValue) {
          const ep = `${workingEndpoint}?limit=${limitValue}${after ? `&after=${after}` : ''}&raw_json=1`;
          console.log(`Page ${page + 1} for r/${sub}: ${ep}`);
          const json = await fetchJSON(ep);
          const posts = normalize(json);
          console.log(`Page ${page + 1} returned ${posts.length} posts for r/${sub}`);
          if (!posts.length) break;

          for (const p of posts) if ((p.created_utc || 0) >= cutoff) collected.push(p);

          after = json?.data?.after || '';
          page += 1;

          const oldest = posts[posts.length - 1];
          if (!after || !oldest || oldest.created_utc < cutoff) break;

          // modest pause between pages to avoid rate limiting while keeping things fast
          await sleep(250 + Math.random() * 250);
        }
        console.log(`Collected ${collected.length} posts from r/${sub} across ${page} pages`);
        const capped = page >= maxPagesValue;
        let partial = false;
        if (capped && collected.length) {
          const oldest = collected[collected.length - 1];
          if ((oldest.created_utc || 0) >= cutoff) partial = true;
        }
        console.log(`Finished processing r/${sub}: ${collected.length} posts, partial=${partial}`);
        return { subreddit: sub, meta, posts: collected, partial };
      } catch (e) {
        console.error(`Error processing r/${sub}:`, e.message);
        return { subreddit: sub, error: e.message, posts: [], partial: false };
      }
    });

    console.log('Running tasks with concurrency limit of 2 and delays...');
    const perSubResults = await runWithConcurrency(tasks, 3);
    const results = perSubResults;
    console.log('All subreddit tasks completed. Results:', results.map(r => ({ 
      subreddit: r.subreddit, 
      postCount: r.posts?.length || 0, 
      hasError: !!r.error 
    })));

    const rateLimited = results.some(r => (r?.error || '').includes('[RATE_LIMIT]'));
    const responseData = {
      mode: modeValue,
      time,
      days: daysValue,
      limit: limitValue,
      max_pages: maxPagesValue,
      results,
      fetched_at: Date.now(),
      rate_limited: rateLimited,
    };

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    if (rateLimited) {
      res.setHeader('X-Rate-Limited', '1');
    }
    
    console.log('=== API Request Completed Successfully ===');
    console.log('Response data summary:', {
      mode: responseData.mode,
      resultCount: responseData.results.length,
      totalPosts: responseData.results.reduce((sum, r) => sum + (r.posts?.length || 0), 0)
    });
    
    return withCORS(res).status(200).json(responseData);
  } catch (error) {
    console.error('=== API Request Failed ===');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return withCORS(res).status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Export for both Vercel and Express
module.exports = handler;
