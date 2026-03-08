import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { InMemoryCache, RedisCache, CacheKeys, CacheStore } from '../cache.js';
import { AlbumsGeneratorClient } from '../api.js';

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: {} }),
        interceptors: {
          request: { use: vi.fn(), eject: vi.fn() },
          response: { use: vi.fn(), eject: vi.fn() },
        },
      }),
    },
  };
});

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  it('returns null for missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('returns stored value within TTL', async () => {
    await cache.set('key', { foo: 'bar' }, 1000);
    expect(await cache.get('key')).toEqual({ foo: 'bar' });
  });

  it('returns null for expired entry', async () => {
    vi.useFakeTimers();
    await cache.set('key', { foo: 'bar' }, 1000);
    vi.advanceTimersByTime(1001);
    expect(await cache.get('key')).toBeNull();
    vi.useRealTimers();
  });

  it('delete removes a key', async () => {
    await cache.set('key', 'val', 1000);
    await cache.delete('key');
    expect(await cache.get('key')).toBeNull();
  });

  it('deleteByPrefix removes matching keys only', async () => {
    await cache.set('prefix:1', 'v1', 1000);
    await cache.set('prefix:2', 'v2', 1000);
    await cache.set('other:1', 'v3', 1000);

    await cache.deleteByPrefix('prefix:');
    expect(await cache.get('prefix:1')).toBeNull();
    expect(await cache.get('prefix:2')).toBeNull();
    expect(await cache.get('other:1')).toEqual('v3');
  });

  it('clearAll removes all keys', async () => {
    await cache.set('k1', 'v1', 1000);
    await cache.set('k2', 'v2', 1000);
    await cache.clearAll();
    expect(await cache.get('k1')).toBeNull();
    expect(await cache.get('k2')).toBeNull();
  });

  it('set overwrites existing value and resets TTL', async () => {
    vi.useFakeTimers();
    await cache.set('key', 'v1', 1000);
    vi.advanceTimersByTime(500);
    await cache.set('key', 'v2', 1000);
    vi.advanceTimersByTime(600);
    expect(await cache.get('key')).toEqual('v2');
    vi.useRealTimers();
  });
});

describe('RedisCache', () => {
  let cache: RedisCache;
  let mockRedis: Redis;

  beforeEach(() => {
    mockRedis = new RedisMock() as unknown as Redis;
    cache = new RedisCache(mockRedis);
  });

  it('returns null for missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('returns stored value', async () => {
    await cache.set('key', { foo: 'bar' }, 1000);
    expect(await cache.get('key')).toEqual({ foo: 'bar' });
  });

  it('delete removes a key', async () => {
    await cache.set('key', 'val', 1000);
    await cache.delete('key');
    expect(await cache.get('key')).toBeNull();
  });

  it('deleteByPrefix removes matching keys via SCAN+DEL', async () => {
    await cache.set('1001mcp:p:1', 'v1', 1000);
    await cache.set('1001mcp:p:2', 'v2', 1000);
    await cache.set('1001mcp:o:1', 'v3', 1000);

    await cache.deleteByPrefix('1001mcp:p:');
    expect(await cache.get('1001mcp:p:1')).toBeNull();
    expect(await cache.get('1001mcp:p:2')).toBeNull();
    expect(await cache.get('1001mcp:o:1')).toEqual('v3');
  });

  it('clearAll removes all 1001mcp: keys', async () => {
    await cache.set('1001mcp:k1', 'v1', 1000);
    await cache.set('1001mcp:k2', 'v2', 1000);
    await cache.clearAll();
    expect(await cache.get('1001mcp:k1')).toBeNull();
    expect(await cache.get('1001mcp:k2')).toBeNull();
  });

  it('ping returns true when client is healthy', async () => {
    expect(await cache.ping()).toBe(true);
  });

  it('ping returns false when client throws', async () => {
    vi.spyOn(mockRedis, 'ping').mockRejectedValueOnce(new Error('fail'));
    expect(await cache.ping()).toBe(false);
  });
});

describe('AlbumsGeneratorClient cache integration', () => {
  let mockCache: CacheStore;
  let client: AlbumsGeneratorClient;
  let axiosGet: any;

  beforeEach(async () => {
    const axios = await import('axios');
    axiosGet = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(axios.default.create).mockReturnValue({
      get: axiosGet,
    } as any);

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      deleteByPrefix: vi.fn(),
      clearAll: vi.fn(),
    };
    client = new AlbumsGeneratorClient('http://api', mockCache);
    vi.spyOn(client as any, 'throttle').mockResolvedValue(undefined);
  });

  it('calls cache.get before fetching and cache.set after a miss', async () => {
    axiosGet.mockResolvedValue({ data: { albums: [] } });
    vi.mocked(mockCache.get).mockResolvedValue(null);

    const result = await client.getGlobalStats();

    expect(mockCache.get).toHaveBeenCalledWith(CacheKeys.global);
    expect(axiosGet).toHaveBeenCalledWith('/albums/stats');
    expect(mockCache.set).toHaveBeenCalledWith(CacheKeys.global, { albums: [] }, expect.any(Number));
    expect(result).toEqual({ albums: [] });
  });

  it('returns cached value without calling API on a hit', async () => {
    const cachedData = { albums: [{ name: 'Test', artist: 'Artist' }] };
    vi.mocked(mockCache.get).mockResolvedValue(cachedData);

    const result = await client.getGlobalStats();

    expect(mockCache.get).toHaveBeenCalledWith(CacheKeys.global);
    expect(axiosGet).not.toHaveBeenCalled();
    expect(result).toEqual(cachedData);
  });

  it('clearCache calls cache.clearAll', async () => {
    await client.clearCache();
    expect(mockCache.clearAll).toHaveBeenCalled();
  });

  it('invalidateGlobalStats calls cache.delete with global key', async () => {
    await client.invalidateGlobalStats();
    expect(mockCache.delete).toHaveBeenCalledWith(CacheKeys.global);
  });

  it('invalidateProject calls cache.delete with correct project key', async () => {
    await client.invalidateProject('p1');
    expect(mockCache.delete).toHaveBeenCalledWith(CacheKeys.project('p1'));
  });

  it('invalidateGroup calls cache.delete and deleteByPrefix with correct keys', async () => {
    await client.invalidateGroup('g1');
    expect(mockCache.delete).toHaveBeenCalledWith(CacheKeys.group('g1'));
    expect(mockCache.deleteByPrefix).toHaveBeenCalledWith(CacheKeys.groupAlbumPrefix('g1'));
  });
});
