const crypto = require('crypto');

const NAME_PREFIX = 'rdd_';

function getSecret() {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret) {
    throw new Error('SESSION_COOKIE_SECRET env var is required for cookie signing');
  }
  return secret;
}

function hmac(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

function makeSignedCookie(name, value, opts = {}) {
  const sig = hmac(value);
  const parts = [
    `${NAME_PREFIX}${name}=${encodeURIComponent(`${value}.${sig}`)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
  ];
  if (opts.maxAge) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  }
  return parts.join('; ');
}

function readSignedCookie(req, name) {
  const rawHeader = req.headers?.cookie || '';
  const match = rawHeader.match(new RegExp(`${NAME_PREFIX}${name}=([^;]+)`));
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  const lastDot = decoded.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = decoded.slice(0, lastDot);
  const sig = decoded.slice(lastDot + 1);
  try {
    return hmac(value) === sig ? value : null;
  } catch (err) {
    console.error('Error reading signed cookie:', err.message);
    return null;
  }
}

function clearCookie(name) {
  return `${NAME_PREFIX}${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

module.exports = {
  makeSignedCookie,
  readSignedCookie,
  clearCookie,
};
