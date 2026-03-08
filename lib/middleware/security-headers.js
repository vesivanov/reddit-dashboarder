function isSecureRequest(req) {
  if (req.secure || req.connection?.encrypted || req.socket?.encrypted) {
    return true;
  }

  const forwardedProto = req.headers?.['x-forwarded-proto'];
  if (!forwardedProto) return false;

  return forwardedProto.split(',')[0].trim() === 'https';
}

function buildCsp() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
  ].join('; ');
}

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', buildCsp());
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

module.exports = {
  securityHeaders,
};
