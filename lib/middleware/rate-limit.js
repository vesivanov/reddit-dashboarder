const { incrementWindow } = require('../rate-limit-store');

function createRateLimiter(windowMs, max, message) {
  return function rateLimitMiddleware(req, res, next) {
    const identifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `${req.path}:${identifier}`;

    Promise.resolve()
      .then(() => incrementWindow(key, windowMs))
      .then((record) => {
        const now = Date.now();
        const retryAfter = Math.max(0, Math.ceil((record.resetAt - now) / 1000));

        res.set('X-RateLimit-Limit', max.toString());
        res.set('X-RateLimit-Remaining', String(Math.max(0, max - record.count)));
        res.set('X-RateLimit-Reset', new Date(record.resetAt).toISOString());

        if (record.count > max) {
          res.set('Retry-After', retryAfter.toString());
          return res.status(429).json({
            error: 'Too many requests',
            message: message || 'Please try again later',
            retryAfter,
            source: 'app',
          });
        }

        return next();
      })
      .catch((error) => {
        console.warn('[rate-limit] Failing open due to store error:', error.message);
        next();
      });
  };
}

module.exports = {
  // Strict for expensive endpoints
  aiRankLimiter: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    10, // 10 requests per 15 min
    'Too many AI ranking requests. Try again in 15 minutes.'
  ),
  
  // Medium for Reddit API
  redditLimiter: createRateLimiter(
    5 * 60 * 1000, // 5 minutes
    30, // 30 requests per 5 min
    'Too many Reddit API requests. Try again in a few minutes.'
  ),
  
  // Loose for read-only
  generalLimiter: createRateLimiter(
    1 * 60 * 1000, // 1 minute
    60, // 60 requests per minute
    'Too many requests. Please slow down.'
  ),
  
  // For waitlist signups
  waitlistLimiter: createRateLimiter(
    60 * 60 * 1000, // 1 hour
    5, // 5 signups per hour per IP
    'Too many signup attempts. Try again in an hour.'
  ),
};
