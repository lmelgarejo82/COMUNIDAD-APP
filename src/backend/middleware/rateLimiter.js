const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { REDIS_URL } = require('../queue/config');

let redisReady = false;
let redisClient = null;

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

function readIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const RATE_LIMIT_WINDOW_MS = readIntEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const RATE_LIMIT_MAX = readIntEnv('RATE_LIMIT_MAX', isProduction ? 300 : 1000);
const AUTH_RATE_LIMIT_MAX = readIntEnv('AUTH_RATE_LIMIT_MAX', isProduction ? 5 : 20);

if (!isTest && REDIS_URL) {
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
}

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

function createRateLimitHandler(message) {
  return (req, res, next, options) => {
    const retryAfter = req.rateLimit?.resetTime
      ? Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil((options.windowMs || RATE_LIMIT_WINDOW_MS) / 1000);

    res.set('Retry-After', String(retryAfter));
    res.status(options.statusCode).json({
      message,
      error: message,
      retryAfter,
    });
  };
}

const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Demasiadas solicitudes. Intentá de nuevo más tarde.'),
  store: createStore('global'),
});

const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Demasiados intentos. Esperá unos minutos antes de volver a intentar.'),
  skipSuccessfulRequests: true,
  store: createStore('auth'),
});

const passwordRecoveryLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Demasiados intentos. Esperá unos minutos antes de volver a intentar.'),
  store: createStore('password-recovery'),
});

module.exports = {
  globalLimiter,
  authLimiter,
  passwordRecoveryLimiter,
  createRateLimitHandler,
  config: {
    windowMs: RATE_LIMIT_WINDOW_MS,
    globalMax: RATE_LIMIT_MAX,
    authMax: AUTH_RATE_LIMIT_MAX,
  },
};
