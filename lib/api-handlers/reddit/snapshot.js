const crypto = require('crypto');
const storage = require('../../storage');
const redditHandler = require('../reddit');
const { readSignedCookie } = require('../../cookies');

const DEFAULT_SNAPSHOT_TTL_SECONDS = 120;

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolQuery(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

function getSnapshotScope(req) {
  const refresh = readSignedCookie(req, 'refresh');
  const access = readSignedCookie(req, 'access');
  const basis = refresh || access || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anon';
  return crypto.createHash('sha1').update(String(basis)).digest('hex').slice(0, 16);
}

function buildSnapshotKey({ scope, query }) {
  const params = new URLSearchParams(query || '');
  const subs = (params.get('subs') || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');

  return [
    'reddit-snapshot-v1',
    scope,
    params.get('mode') || 'new',
    params.get('time') || 'day',
    params.get('days') || '1',
    params.get('limit') || '100',
    params.get('max_pages') || '5',
    subs,
  ].join(':');
}

async function invokeRedditHandler(req) {
  const headers = {};
  let body;
  let statusCode = 200;

  const resMock = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    end(payload) {
      body = payload;
      return this;
    }
  };

  await redditHandler(req, resMock);
  return { statusCode, headers, body };
}

module.exports = async function snapshotHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return redditHandler(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [, rawQuery = ''] = String(req.url || '').split('?');
  const params = new URLSearchParams(rawQuery);
  const forceFresh = boolQuery(params.get('fresh')) || boolQuery(params.get('force_refresh'));
  const ttlSeconds = Math.max(30, readNumber('REDDIT_SNAPSHOT_TTL_SECONDS', DEFAULT_SNAPSHOT_TTL_SECONDS));

  const snapshotKey = buildSnapshotKey({
    scope: getSnapshotScope(req),
    query: params.toString(),
  });

  if (!forceFresh) {
    try {
      const cached = await storage.get(snapshotKey);
      if (cached?.payload) {
        const savedAt = Number(cached.savedAt || cached.payload?.fetched_at || Date.now());
        const ageSeconds = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
        res.setHeader('X-RDD-Snapshot', 'HIT');
        res.setHeader('X-RDD-Snapshot-Age', String(ageSeconds));
        return res.status(200).json({
          ...cached.payload,
          snapshot: {
            cached: true,
            stale: false,
            age_seconds: ageSeconds,
            ttl_seconds: ttlSeconds,
            key: snapshotKey,
          },
        });
      }
    } catch (err) {
      console.warn('[snapshot] cache read failed:', err.message);
    }
  }

  // Preserve request fields like `headers` even when they are non-enumerable
  // (common in Node/Express runtimes) to avoid crashing downstream handlers.
  const passthroughReq = Object.create(req || null);
  passthroughReq.method = req?.method || 'GET';
  passthroughReq.headers = req?.headers || {};
  passthroughReq.connection = req?.connection;
  passthroughReq.socket = req?.socket;
  passthroughReq.url = `/api/reddit?${params.toString()}`;

  try {
    const upstream = await invokeRedditHandler(passthroughReq);

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
      const payload = {
        ...upstream.body,
        snapshot: {
          cached: false,
          stale: false,
          age_seconds: 0,
          ttl_seconds: ttlSeconds,
          key: snapshotKey,
        },
      };
      res.setHeader('X-RDD-Snapshot', 'MISS');

      try {
        await storage.set(snapshotKey, {
          payload,
          savedAt: Date.now(),
        }, ttlSeconds);
      } catch (err) {
        console.warn('[snapshot] cache write failed:', err.message);
      }

      return res.status(upstream.statusCode).json(payload);
    }

    return res.status(upstream.statusCode || 500).json(upstream.body || { error: 'Upstream error' });
  } catch (error) {
    console.error('[snapshot] upstream invoke failed:', error.message);
    return res.status(500).json({ error: 'Snapshot handler failed', message: error.message });
  }
};
