const redditHandler = require('../reddit');
const { buildPassthroughReq, invokeHandler } = require('../../services/reddit-handler-invoke');

module.exports = async function snapshotHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return redditHandler(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [, rawQuery = ''] = String(req.url || '').split('?');

  try {
    const upstream = await invokeHandler(redditHandler, buildPassthroughReq(req, {
      method: req?.method || 'GET',
      url: `/api/reddit?${rawQuery}`,
    }));

    if (upstream?.headers?.['set-cookie']) {
      res.setHeader('Set-Cookie', upstream.headers['set-cookie']);
    }
    if (upstream?.headers?.['x-rate-limited']) {
      res.setHeader('X-Rate-Limited', upstream.headers['x-rate-limited']);
    }
    if (upstream?.headers?.['retry-after']) {
      res.setHeader('Retry-After', upstream.headers['retry-after']);
    }

    if (upstream.statusCode >= 200 && upstream.statusCode < 300 && upstream.body && typeof upstream.body === 'object') {
      res.setHeader('X-RDD-Snapshot', 'MISS');
      return res.status(upstream.statusCode).json({
        ...upstream.body,
        snapshot: {
          cached: false,
          stale: false,
        },
      });
    }

    return res.status(upstream.statusCode || 500).json(upstream.body || { error: 'Upstream error' });
  } catch (error) {
    console.error('[snapshot] upstream invoke failed:', error.message);
    return res.status(500).json({ error: 'Snapshot handler failed', message: error.message });
  }
};
