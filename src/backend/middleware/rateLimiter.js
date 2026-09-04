const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { RedisStore } = require('rate-limit-redis');
const { REDIS_URL } = require('../queue/config');

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

function readIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const DEFAULT_LIMITS = Object.freeze({
  windowMs: readIntEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  globalMax: readIntEnv('RATE_LIMIT_MAX', isProduction ? 300 : 1000),
  authMax: readIntEnv('AUTH_RATE_LIMIT_MAX', isProduction ? 5 : 20),
});
const RATE_LIMIT_VALIDATION = { xForwardedForHeader: false };

function createRateLimitHandler(message, fallbackWindowMs) {
  return (req, res, next, options) => {
    const retryAfter = req.rateLimit?.resetTime
      ? Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil((options.windowMs || fallbackWindowMs) / 1000);

    res.set('Retry-After', String(retryAfter));
    res.status(options.statusCode).json({
      message,
      error: message,
      retryAfter,
    });
  };
}

function buildRateLimiters({ limits, createStore }) {
  const common = {
    windowMs: limits.windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    validate: RATE_LIMIT_VALIDATION,
    passOnStoreError: false,
  };

  const globalLimiter = rateLimit({
    ...common,
    max: limits.globalMax,
    handler: createRateLimitHandler(
      'Demasiadas solicitudes. Intentá de nuevo más tarde.',
      limits.windowMs
    ),
    store: createStore('global'),
  });

  const authLimiter = rateLimit({
    ...common,
    max: limits.authMax,
    handler: createRateLimitHandler(
      'Demasiados intentos. Esperá unos minutos antes de volver a intentar.',
      limits.windowMs
    ),
    skipSuccessfulRequests: true,
    store: createStore('auth', { containDeferredDecrement: true }),
  });

  const passwordRecoveryLimiter = rateLimit({
    ...common,
    max: limits.authMax,
    handler: createRateLimitHandler(
      'Demasiados intentos. Esperá unos minutos antes de volver a intentar.',
      limits.windowMs
    ),
    store: createStore('password-recovery'),
  });

  return { globalLimiter, authLimiter, passwordRecoveryLimiter };
}

function memoryInfrastructure(limits) {
  return {
    ...buildRateLimiters({ limits, createStore: () => undefined }),
    storage: 'memory',
    async close() {},
  };
}

function waitUntilReadyOrExhausted(client, logger, state) {
  let lastError = null;

  client.on('error', (error) => {
    lastError = error;
    if (state.ready && !state.closing) {
      logger.error('[rateLimiter] Redis error en runtime; limitación cerrada:', error.message);
    }
  });

  return new Promise((resolve, reject) => {
    const onReady = () => {
      state.ready = true;
      client.removeListener('end', onEnd);
      client.on('end', () => {
        if (!state.closing) {
          logger.error('[rateLimiter] Redis agotó reconexiones; limitación cerrada.');
        }
      });
      resolve();
    };
    const onEnd = () => {
      client.removeListener('ready', onReady);
      reject(lastError || new Error('Redis terminó la conexión antes de estar listo'));
    };

    client.once('ready', onReady);
    client.once('end', onEnd);
    client.connect().catch((error) => {
      lastError = error;
    });
  });
}

async function initializeRateLimiters(options = {}) {
  const limits = options.limits || DEFAULT_LIMITS;
  const RedisClient = options.RedisClient || Redis;
  const RedisStoreClass = options.RedisStoreClass || RedisStore;
  const logger = options.logger || console;
  const redisUrl = Object.prototype.hasOwnProperty.call(options, 'redisUrl')
    ? options.redisUrl
    : (isTest ? null : REDIS_URL);

  if (!redisUrl) return memoryInfrastructure(limits);

  let client;
  const connectionState = { ready: false, closing: false };
  try {
    client = new RedisClient(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    await waitUntilReadyOrExhausted(client, logger, connectionState);
    logger.log('[rateLimiter] Redis listo; stores compartidos activos.');

    const createStore = (prefix, storeOptions = {}) => {
      const store = new RedisStoreClass({
        prefix: `rl:${prefix}:`,
        sendCommand: (...args) => client.call(...args),
      });

      if (storeOptions.containDeferredDecrement) {
        const decrement = store.decrement.bind(store);
        store.decrement = async (key) => {
          try {
            return await decrement(key);
          } catch (error) {
            // express-rate-limit runs skipSuccessfulRequests decrements after the
            // response and does not observe rejections. Keeping the increment is
            // conservative and avoids an unhandled rejection during an outage.
            logger.error('[rateLimiter] Redis decremento auth falló; contador conservado:', error.message);
            return undefined;
          }
        };
      }

      return store;
    };

    return {
      ...buildRateLimiters({ limits, createStore }),
      storage: 'redis',
      async close() {
        connectionState.closing = true;
        try {
          if (client.status === 'ready') await client.quit();
          else client.disconnect();
        } catch {
          client.disconnect();
        }
      },
    };
  } catch (error) {
    connectionState.closing = true;
    if (client) client.disconnect();
    logger.warn('[rateLimiter] Redis no disponible al iniciar; usando memoria:', error.message);
    return memoryInfrastructure(limits);
  }
}

module.exports = {
  initializeRateLimiters,
  createRateLimitHandler,
  config: DEFAULT_LIMITS,
};
