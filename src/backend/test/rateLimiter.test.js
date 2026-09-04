const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const limiterPath = require.resolve('../middleware/rateLimiter');

function loadRateLimiters(env = {}) {
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
  const limiters = require('../middleware/rateLimiter');

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

test('auth limiter keeps failed login attempts rate limited with structured 429 response', async () => {
  const { limiters, restore } = loadRateLimiters({ AUTH_RATE_LIMIT_MAX: '2' });
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
  const { limiters, restore } = loadRateLimiters({ AUTH_RATE_LIMIT_MAX: '2' });
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
  const { limiters, restore } = loadRateLimiters({ RATE_LIMIT_MAX: '5' });
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
  const { limiters, restore } = loadRateLimiters({ RATE_LIMIT_MAX: '1' });
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
