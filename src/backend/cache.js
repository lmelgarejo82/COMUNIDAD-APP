const Redis = require('ioredis');
const { REDIS_URL } = require('./queue/config');

const CACHE_TTL = {
  SHORT: 60,            // 1 min
  MEDIUM: 300,          // 5 min
  LONG: 1800,           // 30 min
  DAILY: 86400,         // 24 hs
};

let redis = null;

function getClient() {
  if (redis) return redis;
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 3000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => console.log('[cache] Redis conectado'));
    redis.on('error', (err) => console.warn('[cache] Redis error:', err.message));
  } catch (err) {
    console.warn('[cache] Redis no disponible, caché deshabilitado:', err.message);
    redis = null;
  }
  return redis;
}

async function cacheOrFetch(key, ttl, fetchFn) {
  const client = getClient();
  if (!client) return fetchFn();

  try {
    const cached = await client.get(key);
    if (cached !== null) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn(`[cache] Error leyendo ${key}:`, err.message);
  }

  const data = await fetchFn();

  try {
    await client.set(key, JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    console.warn(`[cache] Error escribiendo ${key}:`, err.message);
  }

  return data;
}

async function invalidatePattern(pattern) {
  const client = getClient();
  if (!client) return;

  try {
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn(`[cache] Error invalidando patrón ${pattern}:`, err.message);
  }
}

module.exports = { cacheOrFetch, invalidatePattern, CACHE_TTL };
