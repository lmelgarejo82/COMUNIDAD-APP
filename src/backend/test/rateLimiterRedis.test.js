const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Redis = require('ioredis');

const redisUrl = process.env.RATE_LIMIT_TEST_REDIS_URL;
const integrationOptions = { skip: !redisUrl };

process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX = '1';
process.env.AUTH_RATE_LIMIT_MAX = '2';

const { initializeRateLimiters } = require('../middleware/rateLimiter');

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

async function clearRateLimitKeys(redis) {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'rl:*', 'COUNT', 100);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== '0');
}

test('real Redis stores create and update distinct limiter prefixes', integrationOptions, async () => {
  assert.equal(typeof initializeRateLimiters, 'function');
  const admin = new Redis(redisUrl);
  const limiters = await initializeRateLimiters({ redisUrl });
  const app = express();
  app.get('/global', limiters.globalLimiter, (req, res) => res.json({ ok: true }));
  app.post('/auth', limiters.authLimiter, (req, res) => res.sendStatus(401));
  app.post('/recovery', limiters.passwordRecoveryLimiter, (req, res) => res.json({ message: 'generic' }));
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await clearRateLimitKeys(admin);
    assert.equal(limiters.storage, 'redis');
    assert.equal((await fetch(`${baseUrl}/global`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/auth`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${baseUrl}/recovery`, { method: 'POST' })).status, 200);

    for (const prefix of ['rl:global:*', 'rl:auth:*', 'rl:password-recovery:*']) {
      const keys = await admin.keys(prefix);
      assert.equal(keys.length, 1);
      assert.equal(await admin.get(keys[0]), '1');
    }
  } finally {
    await close(server);
    await limiters.close();
    await clearRateLimitKeys(admin);
    admin.disconnect();
  }
});

test('two limiter instances share the same real Redis counter', integrationOptions, async () => {
  assert.equal(typeof initializeRateLimiters, 'function');
  const admin = new Redis(redisUrl);
  const firstLimiters = await initializeRateLimiters({ redisUrl });
  const secondLimiters = await initializeRateLimiters({ redisUrl });
  const firstApp = express();
  const secondApp = express();
  firstApp.get('/api/test', firstLimiters.globalLimiter, (req, res) => res.json({ ok: true }));
  secondApp.get('/api/test', secondLimiters.globalLimiter, (req, res) => res.json({ ok: true }));
  const firstServer = await listen(firstApp);
  const secondServer = await listen(secondApp);

  try {
    await clearRateLimitKeys(admin);
    assert.equal((await fetch(`http://127.0.0.1:${firstServer.address().port}/api/test`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${secondServer.address().port}/api/test`)).status, 429);
  } finally {
    await close(firstServer);
    await close(secondServer);
    await firstLimiters.close();
    await secondLimiters.close();
    await clearRateLimitKeys(admin);
    admin.disconnect();
  }
});

test('intentional limiter shutdown does not report a runtime Redis outage', integrationOptions, async () => {
  const errors = [];
  const limiters = await initializeRateLimiters({
    redisUrl,
    logger: { log() {}, warn() {}, error: (...args) => errors.push(args) },
  });

  await limiters.close();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(errors, []);
});
