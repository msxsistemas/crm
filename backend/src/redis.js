import Redis from 'ioredis';
import 'dotenv/config';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  // lazyConnect removed so client connects immediately on startup
});

redis.on('error', (err) => {
  // Don't crash on Redis failure — gracefully degrade
  if (err.code !== 'ECONNREFUSED') console.error('Redis error:', err.message);
});

/** Cache wrapper: get from Redis or execute fn and cache the result */
export async function cached(key, ttlSeconds, fn) {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit);
  } catch { /* Redis unavailable — fallback to DB */ }

  const result = await fn();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  } catch { /* ignore */ }

  return result;
}

/** Invalidate one or more cache keys (supports glob patterns via SCAN) */
export async function invalidate(...keys) {
  try {
    for (const key of keys) {
      if (key.includes('*')) {
        let cursor = '0';
        do {
          const [next, found] = await redis.scan(cursor, 'MATCH', key, 'COUNT', 100);
          cursor = next;
          if (found.length) await redis.del(...found);
        } while (cursor !== '0');
      } else {
        await redis.del(key);
      }
    }
  } catch { /* ignore */ }
}
