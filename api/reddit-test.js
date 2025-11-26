// Test endpoint to see full Reddit API response data
// Usage: GET /api/reddit-test?sub=programming&limit=1

const { readSignedCookie } = require('../lib/cookies');

const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const USER_AGENT = process.env.REDDIT_USER_AGENT || DEFAULT_UA;
const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function requestTokenRefresh(refreshTokenValue) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || USER_AGENT;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Reddit OAuth client credentials');
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Refresh token request failed: ${text}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function createTokenManager(req, res) {
  let access = readSignedCookie(req, 'access');
  let refresh = readSignedCookie(req, 'refresh');
  let refreshingPromise = null;

  async function refreshAccessToken() {
    if (!refresh) return null;
    if (!refreshingPromise) {
      refreshingPromise = (async () => {
        console.log('Token manager: refreshing Reddit access token');
        const data = await requestTokenRefresh(refresh);
        access = data.access_token;
        return access;
      })().catch((err) => {
        console.error('Token manager: refresh failed', err);
        access = null;
        refresh = null;
        throw err;
      }).finally(() => {
        refreshingPromise = null;
      });
    }
    return refreshingPromise;
  }

  async function ensureToken() {
    if (access) return access;
    return refreshAccessToken();
  }

  return {
    ensureToken,
    refreshAccessToken,
    hasRefresh: () => Boolean(refresh),
  };
}

function toOAuthUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    if (parsed.hostname.endsWith('reddit.com') && parsed.hostname !== 'oauth.reddit.com') {
      parsed.hostname = 'oauth.reddit.com';
    }
    return parsed.toString();
  } catch (err) {
    console.warn('Unable to normalise URL for OAuth, using original:', inputUrl, err.message);
    return inputUrl;
  }
}

function withCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

async function handler(req, res) {
  console.log('=== Reddit Test Endpoint ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Query:', req.query);

  if (req.method === 'OPTIONS') {
    return withCORS(res).status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(res).status(405).json({ error: 'Method not allowed' });
  }

  const { sub = 'programming', limit = '1' } = req.query;
  const limitValue = Math.min(parseInt(limit) || 1, 5); // Max 5 posts for testing

  const tokenManager = createTokenManager(req, res);
  
  try {
    const token = await tokenManager.ensureToken();
    if (!token) {
      return withCORS(res).status(401).json({ error: 'Not authenticated' });
    }

    // Fetch posts from Reddit
    const url = `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=${limitValue}&raw_json=1`;
    console.log(`Fetching from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = await response.json();
    const children = json?.data?.children || [];

    // Extract full post data for analysis
    const posts = children.map(child => {
      const post = child.data || {};
      
      // Return ALL available fields from Reddit
      return {
        // Currently extracted fields
        id: post.id,
        subreddit: post.subreddit,
        title: post.title,
        selftext: post.selftext,
        selftext_html: post.selftext_html,
        author: post.author,
        url: `https://www.reddit.com${post.permalink}`,
        domain: post.domain,
        score: post.score,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        thumbnail: post.thumbnail,
        
        // Additional fields that might be useful
        name: post.name, // Fullname (e.g., "t3_abc123") - needed for API calls
        permalink: post.permalink,
        link_id: post.link_id, // Parent link fullname for comments
        parent_id: post.parent_id, // Parent fullname
        author_fullname: post.author_fullname, // User fullname (e.g., "t2_xyz789")
        subreddit_id: post.subreddit_id,
        subreddit_type: post.subreddit_type,
        over_18: post.over_18,
        is_self: post.is_self,
        is_video: post.is_video,
        is_reddit_media_domain: post.is_reddit_media_domain,
        pinned: post.pinned,
        locked: post.locked,
        archived: post.archived,
        stickied: post.stickied,
        can_mod_post: post.can_mod_post,
        score_hidden: post.score_hidden,
        send_replies: post.send_replies, // Whether to send reply notifications
        author_premium: post.author_premium,
        author_flair_text: post.author_flair_text,
        author_flair_css_class: post.author_flair_css_class,
        link_flair_text: post.link_flair_text,
        link_flair_type: post.link_flair_type,
        gilded: post.gilded,
        upvote_ratio: post.upvote_ratio,
        total_awards_received: post.total_awards_received,
        awarders: post.awarders,
        mod_reason_title: post.mod_reason_title,
        removed_by_category: post.removed_by_category,
        banned_by: post.banned_by,
        approved_by: post.approved_by,
        edited: post.edited,
        author_cakeday: post.author_cakeday,
        num_crossposts: post.num_crossposts,
        media: post.media,
        is_meta: post.is_meta,
        is_original_content: post.is_original_content,
        is_created_from_ads_ui: post.is_created_from_ads_ui,
        post_hint: post.post_hint,
        preview: post.preview,
        url_overridden_by_dest: post.url_overridden_by_dest,
        secure_media: post.secure_media,
        secure_media_embed: post.secure_media_embed,
        media_embed: post.media_embed,
        thumbnail_width: post.thumbnail_width,
        thumbnail_height: post.thumbnail_height,
        preview_enabled: post.preview_enabled,
        spoiler: post.spoiler,
        contest_mode: post.contest_mode,
        suggested_sort: post.suggested_sort,
        view_count: post.view_count,
        visited: post.visited,
        likes: post.likes, // null, true (upvoted), false (downvoted)
        banned_at_utc: post.banned_at_utc,
        mod_note: post.mod_note,
        mod_reason_by: post.mod_reason_by,
        num_reports: post.num_reports,
        distinguished: post.distinguished,
        removal_reason: post.removal_reason,
        link_flair_background_color: post.link_flair_background_color,
        link_flair_text_color: post.link_flair_text_color,
        subreddit_name_prefixed: post.subreddit_name_prefixed,
        subreddit_subscribers: post.subreddit_subscribers,
        ups: post.ups,
        downs: post.downs,
        hide_score: post.hide_score,
        quarantine: post.quarantine,
        brand_safe: post.brand_safe,
        wls: post.wls,
        top_awarded_type: post.top_awarded_type,
        treatment_tags: post.treatment_tags,
        all_awardings: post.all_awardings,
        discussion_type: post.discussion_type,
        crosspost_parent_list: post.crosspost_parent_list,
        crosspost_parent: post.crosspost_parent,
        
        // Comment-specific fields (if this is a comment)
        body: post.body,
        body_html: post.body_html,
        depth: post.depth,
        replies: post.replies,
        collapsed: post.collapsed,
        collapsed_reason: post.collapsed_reason,
        collapsed_reason_code: post.collapsed_reason_code,
        comment_type: post.comment_type,
        
        // Full raw data for reference
        _raw: post, // Include full raw object for inspection
      };
    });

    return withCORS(res).status(200).json({
      success: true,
      subreddit: sub,
      limit: limitValue,
      fetched_at: new Date().toISOString(),
      post_count: posts.length,
      posts: posts,
      // Also include the raw response structure
      raw_response_structure: {
        kind: json.kind,
        data_keys: Object.keys(json.data || {}),
        first_post_keys: children[0]?.data ? Object.keys(children[0].data) : [],
      },
      note: 'This endpoint shows all available fields from Reddit API. Check _raw for complete data.',
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    
    if (error.message?.includes('Not authenticated') || error.message?.includes('401')) {
      return withCORS(res).status(401).json({ error: 'Not authenticated' });
    }

    return withCORS(res).status(500).json({
      error: 'Failed to fetch Reddit data',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = handler;

