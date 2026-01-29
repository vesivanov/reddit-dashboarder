require('./deprecation-filter');
const crypto = require('crypto');

const NAME_PREFIX = 'rdd_';

let missingSecretWarned = false;
function getSecret() {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret) {
    if (!missingSecretWarned) {
      console.error('[cookies] SESSION_COOKIE_SECRET is not set - treating all requests as unauthenticated');
      missingSecretWarned = true;
    }
    return null;
  }
  return secret;
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function isSecure() {
  // Only use Secure flag in production (HTTPS)
  // For localhost development, we need cookies to work over HTTP
  const nodeEnv = process.env.NODE_ENV;
  const isProduction = nodeEnv === 'production';
  
  // Also check if we're explicitly told to use secure cookies
  const forceSecure = process.env.COOKIE_SECURE === 'true';
  
  // Check if redirect URI suggests HTTPS (production)
  const redirectUri = process.env.REDDIT_REDIRECT_URI || '';
  const isHttpsRedirect = redirectUri.startsWith('https://');
  
  return isProduction || forceSecure || isHttpsRedirect;
}

function makeSignedCookie(name, value, opts = {}) {
  const secret = getSecret();
  if (!secret) {
    throw new Error('SESSION_COOKIE_SECRET env var is required for cookie signing');
  }
  const sig = hmac(value, secret);
  const parts = [
    `${NAME_PREFIX}${name}=${encodeURIComponent(`${value}.${sig}`)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  
  // Only add Secure flag in production/HTTPS environments
  if (isSecure()) {
    parts.push('Secure');
  }
  
  if (opts.maxAge) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  }
  return parts.join('; ');
}

function readSignedCookie(req, name) {
  const secret = getSecret();
  if (!secret) return null;
  const rawHeader = req.headers?.cookie || '';
  const cookieName = `${NAME_PREFIX}${name}`;
  const match = rawHeader.match(new RegExp(`${cookieName}=([^;]+)`));
  
  // Debug logging only when DEBUG_COOKIES=1 (avoids console spam)
  if (process.env.DEBUG_COOKIES === '1') {
    if (!match) {
      console.log(`Cookie read attempt: ${cookieName} not found`);
    } else {
      console.log(`Cookie read attempt: ${cookieName} found`);
    }
  }
  
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  const lastDot = decoded.lastIndexOf('.');
  if (lastDot === -1) {
    if (process.env.DEBUG_COOKIES === '1') {
      console.log(`Cookie ${cookieName} has invalid format (no signature separator)`);
    }
    return null;
  }
  const value = decoded.slice(0, lastDot);
  const sig = decoded.slice(lastDot + 1);
  try {
    const isValid = hmac(value, secret) === sig;
    if (process.env.DEBUG_COOKIES === '1' && !isValid) {
      console.log(`Cookie ${cookieName} signature validation failed`);
    }
    return isValid ? value : null;
  } catch (err) {
    console.error('Error reading signed cookie:', err.message);
    return null;
  }
}

function clearCookie(name) {
  const parts = [
    `${NAME_PREFIX}${name}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  
  // Only add Secure flag in production/HTTPS environments
  if (isSecure()) {
    parts.push('Secure');
  }
  
  return parts.join('; ');
}

module.exports = {
  makeSignedCookie,
  readSignedCookie,
  clearCookie,
};
