import { Redis } from 'ioredis';

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
  clearAll(): Promise<void>;
  /** Optional: returns true if the store is healthy. Always true for in-memory. */
  ping?(): Promise<boolean>;
  /** Optional: cleanly disconnect. */
  disconnect?(): Promise<void>;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // Date.now() + ttlMs
}

export class InMemoryCache implements CacheStore {
  private store = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, { data: value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async clearAll(): Promise<void> {
    this.store.clear();
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

export class RedisCache implements CacheStore {
  private client: Redis;

  constructor(urlOrClient: string | Redis) {
    if (typeof urlOrClient === 'string') {
      this.client = new Redis(urlOrClient, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });
    } else {
      this.client = urlOrClient;
    }

    this.client.on('error', (err: Error) => {
      console.error('[redis] connection error:', err.message);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async clearAll(): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        '1001mcp:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

export const CacheKeys = {
  global: '1001mcp:global',
  user: '1001mcp:user',
  project: (id: string) => `1001mcp:project:${id}`,
  group: (slug: string) => `1001mcp:group:${slug}`,
  groupAlbum: (slug: string, uuid: string) => `1001mcp:groupalbum:${slug}:${uuid}`,
  groupAlbumPrefix: (slug: string) => `1001mcp:groupalbum:${slug}:`,
} as const;
