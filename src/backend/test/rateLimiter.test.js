const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { getTrustProxySetting } = require('../config/security');

const limiterPath = require.resolve('../middleware/rateLimiter');

async function loadRateLimiters(env = {}) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
    AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX,
  };

  process.env.NODE_ENV = 'test';
  process.env.RATE_LIMIT_WINDOW_MS = env.RATE_LIMIT_WINDOW_MS || '60000';
  process.env.RATE_LIMIT_MAX = env.RATE_LIMIT_MAX || '100';
  process.env.AUTH_RATE_LIMIT_MAX = env.AUTH_RATE_LIMIT_MAX || '100';

  delete require.cache[limiterPath];
  const { initializeRateLimiters } = require('../middleware/rateLimiter');
  const limiters = await initializeRateLimiters();

  return {
    limiters,
    restore() {
      delete require.cache[limiterPath];
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('direct requests ignore client-supplied forwarding headers by default', async () => {
  const app = express();
  app.set('trust proxy', getTrustProxySetting({}));
  app.get('/ip', (req, res) => res.json({ ip: req.ip, ips: req.ips }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/ip`, {
      headers: { 'X-Forwarded-For': '198.51.100.40' },
    });
    const body = await response.json();

    assert.notEqual(body.ip, '198.51.100.40');
    assert.deepEqual(body.ips, []);
  } finally {
    await close(server);
  }
});

test('rotating forwarding headers cannot evade the direct-path global limiter', async () => {
  const { limiters, restore } = await loadRateLimiters({ RATE_LIMIT_MAX: '1' });
  const app = express();
  app.set('trust proxy', getTrustProxySetting({}));
  app.use('/api', limiters.globalLimiter);
  app.get('/api/test', (req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.41' },
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.42' },
    })).status, 429);
  } finally {
    await close(server);
    restore();
  }
});

test('direct-path forwarding headers are ignored without client-triggered config diagnostics', async () => {
  const { limiters, restore } = await loadRateLimiters({ RATE_LIMIT_MAX: '1' });
  const app = express();
  app.set('trust proxy', getTrustProxySetting({}));
  app.use('/api', limiters.globalLimiter);
  app.get('/api/test', (req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalConsoleError = console.error;
  const diagnostics = [];
  console.error = (...args) => diagnostics.push(args);

  try {
    assert.equal((await fetch(`${baseUrl}/api/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.43' },
    })).status, 200);
    assert.deepEqual(diagnostics, []);
  } finally {
    console.error = originalConsoleError;
    await close(server);
    restore();
  }
});

test('an untrusted direct peer cannot rotate identities when proxy trust is configured', async () => {
  const { limiters, restore } = await loadRateLimiters({ RATE_LIMIT_MAX: '1' });
  const app = express();
  app.set('trust proxy', getTrustProxySetting({ TRUST_PROXY_IP: '192.0.2.10' }));
  app.use('/api', limiters.globalLimiter);
  app.get('/api/test', (req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.44' },
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.45' },
    })).status, 429);
  } finally {
    await close(server);
    restore();
  }
});

test('configured proxy IP produces a stable forwarded client identity', async () => {
  const { limiters, restore } = await loadRateLimiters({ RATE_LIMIT_MAX: '1' });
  const app = express();
  app.set('trust proxy', getTrustProxySetting({ TRUST_PROXY_IP: '127.0.0.1' }));
  app.use('/api', limiters.globalLimiter);
  app.get('/api/test', (req, res) => res.json({ ip: req.ip, ips: req.ips }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const first = await fetch(`${baseUrl}/api/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.50, 203.0.113.10' },
    });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).ip, '203.0.113.10');

    const limited = await fetch(`${baseUrl}/api/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.51, 203.0.113.10' },
    });
    assert.equal(limited.status, 429);
  } finally {
    await close(server);
    restore();
  }
});

test('health remains outside the global limiter', async () => {
  const { limiters, restore } = await loadRateLimiters({ RATE_LIMIT_MAX: '1' });
  const app = express();
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', limiters.globalLimiter);
  app.get('/api/test', (req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/test`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/test`)).status, 429);
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
  } finally {
    await close(server);
    restore();
  }
});

test('auth limiter keeps failed login attempts rate limited with structured 429 response', async () => {
  const { limiters, restore } = await loadRateLimiters({ AUTH_RATE_LIMIT_MAX: '2' });
  const app = express();
  app.use(express.json());
  app.post('/api/auth/login', limiters.authLimiter, (req, res) => {
    res.status(401).json({ error: 'Credenciales inválidas' });
  });

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' })).status, 401);

    const limited = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
    const body = await limited.json();

    assert.equal(limited.status, 429);
    assert.equal(body.message, 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.');
    assert.equal(body.error, body.message);
    assert.equal(typeof body.retryAfter, 'number');
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  } finally {
    await close(server);
    restore();
  }
});

test('password recovery limiter counts generic successful responses equally', async () => {
  const { limiters, restore } = await loadRateLimiters({ AUTH_RATE_LIMIT_MAX: '2' });
  const app = express();
  app.use(express.json());
  app.post('/api/auth/forgot-password', limiters.passwordRecoveryLimiter, (req, res) => {
    res.json({ message: 'generic' });
  });

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/auth/forgot-password`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/auth/forgot-password`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/auth/forgot-password`, { method: 'POST' })).status, 429);
  } finally {
    await close(server);
    restore();
  }
});

test('global API limiter allows reasonable authenticated navigation bursts', async () => {
  const { limiters, restore } = await loadRateLimiters({ RATE_LIMIT_MAX: '5' });
  const app = express();
  app.use('/api', limiters.globalLimiter);
  app.get('/api/dashboard/admin', (req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${baseUrl}/api/dashboard/admin`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(response.status, 200);
    }
  } finally {
    await close(server);
    restore();
  }
});

test('global API limiter returns structured 429 after configured limit', async () => {
  const { limiters, restore } = await loadRateLimiters({ RATE_LIMIT_MAX: '1' });
  const app = express();
  app.use('/api', limiters.globalLimiter);
  app.get('/api/dashboard/admin', (req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/dashboard/admin`)).status, 200);

    const limited = await fetch(`${baseUrl}/api/dashboard/admin`);
    const body = await limited.json();

    assert.equal(limited.status, 429);
    assert.equal(body.message, 'Demasiadas solicitudes. Intentá de nuevo más tarde.');
    assert.equal(body.error, body.message);
    assert.equal(typeof body.retryAfter, 'number');
  } finally {
    await close(server);
    restore();
  }
});

test('test mode initializes memory limiting without constructing a Redis client', async () => {
  delete require.cache[limiterPath];
  const { initializeRateLimiters } = require('../middleware/rateLimiter');
  let redisConstructed = false;

  class UnexpectedRedisClient {
    constructor() {
      redisConstructed = true;
      throw new Error('Redis must not be constructed in the default test path');
    }
  }

  const limiters = await initializeRateLimiters({ RedisClient: UnexpectedRedisClient });

  assert.equal(limiters.storage, 'memory');
  assert.equal(redisConstructed, false);
});

test('an exhausted Redis startup falls back explicitly to working memory limiters', async () => {
  delete require.cache[limiterPath];
  const { EventEmitter } = require('node:events');
  const { initializeRateLimiters } = require('../middleware/rateLimiter');
  const warnings = [];

  class UnavailableRedisClient extends EventEmitter {
    connect() {
      const error = new Error('test Redis unavailable');
      queueMicrotask(() => {
        this.emit('error', error);
        this.emit('end');
      });
      return Promise.reject(error);
    }

    disconnect() {}
  }

  const limiters = await initializeRateLimiters({
    redisUrl: 'redis://unavailable.test:6379',
    RedisClient: UnavailableRedisClient,
    logger: { log() {}, warn: (...args) => warnings.push(args), error() {} },
    limits: { windowMs: 60000, globalMax: 2, authMax: 2 },
  });

  assert.equal(limiters.storage, 'memory');
  assert.equal(warnings.length, 1);

  const app = express();
  app.use('/api', limiters.globalLimiter);
  app.get('/api/test', (req, res) => res.json({ ok: true }));
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/test`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/test`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/test`)).status, 429);
  } finally {
    await close(server);
  }
});

test('auth limiter does not charge successful responses', async () => {
  const { limiters, restore } = await loadRateLimiters({ AUTH_RATE_LIMIT_MAX: '1' });
  const app = express();
  let succeed = true;
  app.post('/api/auth/login', limiters.authLimiter, (req, res) => {
    res.sendStatus(succeed ? 200 : 401);
  });

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' })).status, 200);
    succeed = false;
    assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' })).status, 429);
  } finally {
    await close(server);
    restore();
  }
});

test('auth limiter contains a deferred Redis decrement failure conservatively', async () => {
  delete require.cache[limiterPath];
  const { EventEmitter } = require('node:events');
  const { initializeRateLimiters } = require('../middleware/rateLimiter');
  const errors = [];

  class ReadyRedisClient extends EventEmitter {
    constructor() {
      super();
      this.status = 'wait';
    }

    connect() {
      queueMicrotask(() => {
        this.status = 'ready';
        this.emit('ready');
      });
      return Promise.resolve();
    }

    call() {}
    disconnect() {}
  }

  class DeferredFailureStore {
    init() {}

    async increment() {
      return { totalHits: 1, resetTime: new Date(Date.now() + 60000) };
    }

    async decrement() {
      throw new Error('runtime Redis outage during auth decrement');
    }

    async resetKey() {}
  }

  const limiters = await initializeRateLimiters({
    redisUrl: 'redis://ready.test:6379',
    RedisClient: ReadyRedisClient,
    RedisStoreClass: DeferredFailureStore,
    logger: { log() {}, warn() {}, error: (...args) => errors.push(args) },
    limits: { windowMs: 60000, globalMax: 2, authMax: 2 },
  });
  const app = express();
  app.post('/api/auth/login', limiters.authLimiter, (req, res) => res.sendStatus(200));
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' })).status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(errors.length, 1);
    assert.match(errors[0].join(' '), /decremento auth falló; contador conservado/);
  } finally {
    await close(server);
    await limiters.close();
  }
});
