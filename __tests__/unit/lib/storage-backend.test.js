const { describe, test, expect, afterEach } = require('@jest/globals');

const ORIGINAL_ENV = { ...process.env };

function loadBackendWithEnv(env, setupMocks = () => {}) {
  process.env = { ...ORIGINAL_ENV, ...env };

  jest.resetModules();
  setupMocks();

  let backend;
  jest.isolateModules(() => {
    backend = require('../../../lib/storage/backend');
  });

  return backend;
}

describe('storage backend selection', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns null and reports no persistent store when no backend env vars are set', () => {
    const backend = loadBackendWithEnv({
      REDIS_URL: '',
      REDIS_TOKEN: '',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
    });

    backend.resetRawStoreForTests();

    expect(backend.hasPersistentStoreConfigured()).toBe(false);
    expect(backend.getRawStore()).toBeNull();
  });

  test('uses Redis REST config from REDIS_URL with embedded credentials', () => {
    const redisConstructor = jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }));

    const backend = loadBackendWithEnv(
      {
        REDIS_URL: 'https://default:token123@redis.example.com',
        REDIS_TOKEN: '',
        UPSTASH_REDIS_REST_URL: '',
        UPSTASH_REDIS_REST_TOKEN: '',
        KV_REST_API_URL: '',
        KV_REST_API_TOKEN: '',
      },
      () => {
        jest.doMock('@upstash/redis', () => ({
          Redis: redisConstructor,
        }), { virtual: true });
      }
    );

    backend.resetRawStoreForTests();
    const store = backend.getRawStore();

    expect(backend.hasPersistentStoreConfigured()).toBe(true);
    expect(redisConstructor).toHaveBeenCalledWith({
      url: 'https://redis.example.com',
      token: 'token123',
    });
    expect(store.kind).toBe('redis-rest');
  });

  test('falls back to legacy Vercel KV when Redis is not configured', async () => {
    const kv = {
      get: jest.fn().mockResolvedValue('value'),
      set: jest.fn().mockResolvedValue('ok'),
      del: jest.fn().mockResolvedValue(1),
    };

    const backend = loadBackendWithEnv(
      {
        REDIS_URL: '',
        REDIS_TOKEN: '',
        UPSTASH_REDIS_REST_URL: '',
        UPSTASH_REDIS_REST_TOKEN: '',
        KV_REST_API_URL: 'https://kv.example.com',
        KV_REST_API_TOKEN: 'kv-token',
      },
      () => {
        jest.doMock('@vercel/kv', () => kv, { virtual: true });
      }
    );

    backend.resetRawStoreForTests();
    const store = backend.getRawStore();

    expect(backend.hasPersistentStoreConfigured()).toBe(true);
    expect(store.kind).toBe('vercel-kv');
    await store.get('test-key');
    expect(kv.get).toHaveBeenCalledWith('test-key');
  });

  test('prefers explicit Upstash config over legacy KV', () => {
    const redisConstructor = jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }));

    const backend = loadBackendWithEnv(
      {
        UPSTASH_REDIS_REST_URL: 'https://upstash.example.com',
        UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
        KV_REST_API_URL: 'https://kv.example.com',
        KV_REST_API_TOKEN: 'kv-token',
      },
      () => {
        jest.doMock('@upstash/redis', () => ({
          Redis: redisConstructor,
        }), { virtual: true });
        jest.doMock('@vercel/kv', () => ({
          get: jest.fn(),
          set: jest.fn(),
          del: jest.fn(),
        }), { virtual: true });
      }
    );

    backend.resetRawStoreForTests();
    const store = backend.getRawStore();

    expect(store.kind).toBe('upstash');
    expect(redisConstructor).toHaveBeenCalledWith({
      url: 'https://upstash.example.com',
      token: 'upstash-token',
    });
  });
});
