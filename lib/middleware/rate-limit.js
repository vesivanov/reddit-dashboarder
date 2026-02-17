// Simple in-memory rate limiting (for quick deployment)
// TODO: Replace with Redis-backed rate limiting for production

const rateLimitStore = new Map();

function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetAt > 60000) { // Clean up entries older than 1 min
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupOldEntries, 60000);

function createRateLimiter(windowMs, max, message) {
  return function rateLimitMiddleware(req, res, next) {
    const identifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `${req.path}:${identifier}`;
    const now = Date.now();
    
    let record = rateLimitStore.get(key);
    
    if (!record || now > record.resetAt) {
      // New window
      record = {
        count: 1,
        resetAt: now + windowMs,
      };
      rateLimitStore.set(key, record);
      return next();
    }
    
    if (record.count >= max) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', max.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', new Date(record.resetAt).toISOString());
      
      return res.status(429).json({
        error: 'Too many requests',
        message: message || 'Please try again later',
        retryAfter: retryAfter
      });
    }
    
    // Increment count
    record.count += 1;
    rateLimitStore.set(key, record);
    
    // Set rate limit headers
    res.set('X-RateLimit-Limit', max.toString());
    res.set('X-RateLimit-Remaining', (max - record.count).toString());
    res.set('X-RateLimit-Reset', new Date(record.resetAt).toISOString());
    
    next();
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
