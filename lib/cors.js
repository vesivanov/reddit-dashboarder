// Centralized CORS configuration
// Add your production domains here

const ALLOWED_ORIGINS = [
  'https://reddit-dashboarder.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173', // Vite dev server
];

// Allow custom domain via environment variable
if (process.env.APP_DOMAIN) {
  const customDomain = process.env.APP_DOMAIN.replace(/\/+$/, ''); // Remove trailing slashes
  if (!ALLOWED_ORIGINS.includes(customDomain)) {
    ALLOWED_ORIGINS.push(customDomain);
  }
}

function withCORS(req, res, methods = 'GET, OPTIONS') {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Same-origin requests don't have Origin header - allow them
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  // If origin doesn't match, don't set the header (browser will block)

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  return res;
}

module.exports = {
  ALLOWED_ORIGINS,
  withCORS,
};
