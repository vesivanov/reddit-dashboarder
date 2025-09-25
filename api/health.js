// Health check endpoint for debugging Vercel deployment
export default async function handler(req, res) {
  console.log('=== Health Check Request ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query:', req.query);
  console.log('Timestamp:', new Date().toISOString());
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_REGION: process.env.VERCEL_REGION
  });

  // Set CORS headers
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
      VERCEL_REGION: process.env.VERCEL_REGION
    },
    request: {
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      query: req.query
    },
    server: {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    }
  };

  console.log('Health check response:', healthData);
  return res.status(200).json(healthData);
}
