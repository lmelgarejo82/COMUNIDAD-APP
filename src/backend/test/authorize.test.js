const test = require('node:test');
const assert = require('node:assert/strict');

const authorizePath = require.resolve('../middleware/authorize');
const dbPath = require.resolve('../db');

function loadAuthorize({ isSuperAdmin = false } = {}) {
  delete require.cache[authorizePath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: {
        async query() {
          return { rows: [{ is_super_admin: isSuperAdmin }] };
        },
      },
    },
  };
  return require('../middleware/authorize').authorize;
}

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('authorize allows access_operator on access-scoped routes', async () => {
  const authorize = loadAuthorize();
  const req = { user: { id: 9, role: 'access_operator' } };
  const res = createResponse();
  let nextCalled = false;

  await authorize('admin', 'access_operator')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('authorize blocks access_operator from admin-only routes', async () => {
  const authorize = loadAuthorize();
  const req = { user: { id: 9, role: 'access_operator' } };
  const res = createResponse();
  let nextCalled = false;

  await authorize('admin')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('authorize blocks resident from access operator routes', async () => {
  const authorize = loadAuthorize();
  const req = { user: { id: 10, role: 'residente' } };
  const res = createResponse();
  let nextCalled = false;

  await authorize('admin', 'access_operator')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});
