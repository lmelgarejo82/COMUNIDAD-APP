const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { REDIS_URL } = require('../queue/config');

let redisReady = false;
let redisClient = null;

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 2,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => {
  redisReady = true;
  console.log('[rateLimiter] Redis conectado');
});
redis.on('error', (err) => {
  if (redisReady) console.warn('[rateLimiter] Redis error:', err.message);
});
redis.on('close', () => {
  redisReady = false;
});

redisClient = redis;

function createStore(prefix) {
  if (!redisReady) {
    if (!redisClient || redisClient.status === 'end') return undefined;
    console.log(`[rateLimiter] Redis no listo para ${prefix}, usando memoria.`);
    return undefined;
  }

  try {
    const { RedisStore } = require('rate-limit-redis');
    return new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (...args) => redisClient.call(...args),
    });
  } catch (err) {
    console.warn(`[rateLimiter] Error creando store ${prefix}, usando memoria:`, err.message);
    return undefined;
  }
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intentá de nuevo más tarde.' },
  store: createStore('global'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
  skipSuccessfulRequests: true,
  store: createStore('auth'),
});

module.exports = { globalLimiter, authLimiter };
