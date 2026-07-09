const test = require('node:test');
const assert = require('node:assert/strict');

const userPath = require.resolve('../models/User');
const adminComplexPath = require.resolve('../models/AdminComplex');
const dbPath = require.resolve('../db');
const middlewarePath = require.resolve('../middleware/setCommunity');

function loadMiddleware({ users = {}, adminAccess = new Set(), firstComplex = null, queryRows = [] } = {}) {
  delete require.cache[middlewarePath];

  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: {
      User: {
        async findById(id) {
          return users[id] || null;
        },
      },
    },
  };

  require.cache[adminComplexPath] = {
    id: adminComplexPath,
    filename: adminComplexPath,
    loaded: true,
    exports: {
      AdminComplex: {
        async verifyAdminAccess(userId, complexId) {
          return adminAccess.has(`${userId}:${complexId}`);
        },
        async getFirstComplexForAdmin() {
          return firstComplex;
        },
      },
    },
  };

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: {
        async query(sql, params) {
          const handler = queryRows.shift();
          if (!handler) return { rows: [] };
          return typeof handler === 'function' ? handler(sql, params) : handler;
        },
      },
    },
  };

  return require('../middleware/setCommunity').setCommunity;
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

test('admin cannot select a community without assigned complex access', async () => {
  const setCommunity = loadMiddleware({
    queryRows: [
      { rows: [{ is_super_admin: false }] },
      { rows: [{ id: 20 }] },
      { rows: [] },
    ],
  });
  const req = { user: { id: 1, role: 'admin' }, query: { community: '20' } };
  const res = createResponse();
  let nextCalled = false;

  await setCommunity(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('admin can select an assigned complex and receives validated context', async () => {
  const setCommunity = loadMiddleware({
    adminAccess: new Set(['1:7']),
    queryRows: [
      { rows: [{ is_super_admin: false }] },
      { rows: [{ id: 7, community_id: 30 }] },
    ],
  });
  const req = { user: { id: 1, role: 'admin' }, query: { complex: '7' } };
  const res = createResponse();
  let nextCalled = false;

  await setCommunity(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.communityId, 30);
  assert.equal(req.complexId, 7);
});

test('admin cannot select an unassigned complex', async () => {
  const setCommunity = loadMiddleware({
    queryRows: [
      { rows: [{ is_super_admin: false }] },
      { rows: [{ id: 8, community_id: 40 }] },
    ],
  });
  const req = { user: { id: 1, role: 'admin' }, query: { complex: '8' } };
  const res = createResponse();
  let nextCalled = false;

  await setCommunity(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('resident cannot force a different community', async () => {
  const setCommunity = loadMiddleware({
    users: {
      2: { id: 2, role: 'residente', community_id: 10 },
    },
  });
  const req = { user: { id: 2, role: 'residente' }, query: { community: '11' } };
  const res = createResponse();
  let nextCalled = false;

  await setCommunity(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('access operator uses own community context and cannot force another community', async () => {
  const setCommunity = loadMiddleware({
    users: {
      9: { id: 9, role: 'access_operator', community_id: 10 },
    },
  });
  const req = { user: { id: 9, role: 'access_operator' }, query: { community: '11' } };
  const res = createResponse();
  let nextCalled = false;

  await setCommunity(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('access operator receives validated own community when no context is forced', async () => {
  const setCommunity = loadMiddleware({
    users: {
      9: { id: 9, role: 'access_operator', community_id: 10 },
    },
  });
  const req = { user: { id: 9, role: 'access_operator' }, query: {} };
  const res = createResponse();
  let nextCalled = false;

  await setCommunity(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.communityId, 10);
  assert.equal(req.scope, 'user-community');
});
