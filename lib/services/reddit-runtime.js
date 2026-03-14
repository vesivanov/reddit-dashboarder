const DEFAULT_REDDIT_USER_AGENT = 'RedditDashboarder/1.0';

let browserUserAgentWarningShown = false;

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function isBrowserLikeUserAgent(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes('mozilla/')
    || normalized.includes('applewebkit/')
    || normalized.includes('chrome/')
    || normalized.includes('safari/');
}

function getRedditUserAgent() {
  const configured = String(process.env.REDDIT_USER_AGENT || '').trim();
  if (configured && !isBrowserLikeUserAgent(configured)) {
    return configured;
  }

  if (!browserUserAgentWarningShown && configured) {
    console.warn('[reddit-runtime] Ignoring browser-like REDDIT_USER_AGENT; using API-safe default instead.');
    browserUserAgentWarningShown = true;
  }

  return DEFAULT_REDDIT_USER_AGENT;
}

function isPublicRedditFallbackAllowed() {
  if (process.env.REDDIT_ALLOW_PUBLIC_FALLBACK !== undefined) {
    return isTruthy(process.env.REDDIT_ALLOW_PUBLIC_FALLBACK);
  }

  return process.env.NODE_ENV !== 'production';
}

module.exports = {
  DEFAULT_REDDIT_USER_AGENT,
  getRedditUserAgent,
  isPublicRedditFallbackAllowed,
};
