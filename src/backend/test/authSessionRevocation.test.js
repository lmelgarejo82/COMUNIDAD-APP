const test = require('node:test');
const assert = require('node:assert/strict');

const userPath = require.resolve('../models/User');
const sessionPath = require.resolve('../middleware/sessionVersion');
const authPath = require.resolve('../middleware/auth');
const uploadsAuthPath = require.resolve('../middleware/uploadsAuth');
const jwtPath = require.resolve('jsonwebtoken');

function loadSessionVersion(versions) {
  delete require.cache[sessionPath];
  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: {
      User: {
        async getAuthVersion(id) {
          return Object.prototype.hasOwnProperty.call(versions, id) ? versions[id] : null;
        },
      },
    },
  };
  return require('../middleware/sessionVersion');
}

test('legacy JWT is valid at version zero and rejected after password revocation', async () => {
  const versions = { 7: 0 };
  const { isSessionCurrent } = loadSessionVersion(versions);

  assert.equal(await isSessionCurrent({ id: 7 }), true);
  versions[7] = 1;
  assert.equal(await isSessionCurrent({ id: 7 }), false);
  assert.equal(await isSessionCurrent({ id: 7, auth_version: 1 }), true);
});

test('password revocation affects only the changed user', async () => {
  const { isSessionCurrent } = loadSessionVersion({ 7: 2, 8: 0 });

  assert.equal(await isSessionCurrent({ id: 7, auth_version: 1 }), false);
  assert.equal(await isSessionCurrent({ id: 8, auth_version: 0 }), true);
});

test('missing users and malformed auth-version claims are rejected', async () => {
  const { isSessionCurrent } = loadSessionVersion({ 7: 1 });

  assert.equal(await isSessionCurrent({ id: 99, auth_version: 0 }), false);
  assert.equal(await isSessionCurrent({ id: 7, auth_version: '1' }), false);
  assert.equal(await isSessionCurrent({ id: 7, auth_version: -1 }), false);
  assert.equal(await isSessionCurrent({ id: '7', auth_version: 1 }), false);
});

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function loadAuthMiddleware(path, sessionIsCurrent) {
  delete require.cache[path];
  require.cache[jwtPath] = {
    id: jwtPath,
    filename: jwtPath,
    loaded: true,
    exports: { verify: () => ({ id: 7, auth_version: 0 }) },
  };
  require.cache[sessionPath] = {
    id: sessionPath,
    filename: sessionPath,
    loaded: true,
    exports: { isSessionCurrent: async () => sessionIsCurrent },
  };
  return require(path);
}

test('API authentication rejects a correctly signed but revoked session', async () => {
  const { authenticate } = loadAuthMiddleware(authPath, false);
  const res = response();
  let nextCalled = false;

  await authenticate({ headers: { authorization: 'Bearer signed-token' } }, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('uploads authentication rejects revoked sessions and accepts current ones', async () => {
  const stale = loadAuthMiddleware(uploadsAuthPath, false).uploadsAuth;
  const staleRes = response();
  let staleNext = false;
  await stale({ query: {}, headers: { authorization: 'Bearer signed-token' } }, staleRes, () => { staleNext = true; });
  assert.equal(staleRes.statusCode, 401);
  assert.equal(staleNext, false);

  const current = loadAuthMiddleware(uploadsAuthPath, true).uploadsAuth;
  const currentRes = response();
  let currentNext = false;
  const currentReq = { query: {}, headers: { authorization: 'Bearer signed-token' } };
  await current(currentReq, currentRes, () => { currentNext = true; });
  assert.equal(currentRes.statusCode, 200);
  assert.equal(currentNext, true);
  assert.deepEqual(currentReq.user, { id: 7, auth_version: 0 });
});

test('uploads authentication rejects JWTs supplied through the query string', async () => {
  const { uploadsAuth } = loadAuthMiddleware(uploadsAuthPath, true);
  const res = response();
  let nextCalled = false;

  await uploadsAuth({ query: { token: 'signed-token' }, headers: {} }, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});
