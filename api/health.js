const { parseRequest } = require('../lib/request-utils');

async function handler(req, res) {
  const { url, query } = parseRequest(req);
  console.log('=== Health Check Request ===');
  console.log('Method:', req.method);
  console.log('URL:', url.pathname + url.search);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query snapshot:', query);
  console.log('Timestamp:', new Date().toISOString());
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_REGION: process.env.VERCEL_REGION,
  });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_REGION: process.env.VERCEL_REGION,
    },
    request: {
      method: req.method,
      url: url.pathname + url.search,
      userAgent: req.headers['user-agent'],
      query,
    },
    server: {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    },
  };

  console.log('Health check response:', healthData);
  return res.status(200).json(healthData);
}

module.exports = handler;
module.exports.default = handler;
