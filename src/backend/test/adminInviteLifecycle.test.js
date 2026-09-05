const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const dbPath = require.resolve('../db');
const invitePath = require.resolve('../models/Invite');
const adminControllerPath = require.resolve('../controllers/adminController');
const adminComplexPath = require.resolve('../models/AdminComplex');
const accountEmailPath = require.resolve('../services/accountEmail');
const authPath = require.resolve('../middleware/auth');
const setCommunityPath = require.resolve('../middleware/setCommunity');
const auditControllerPath = require.resolve('../controllers/auditController');
const adminRoutePath = require.resolve('../routes/admin');

function mockModule(path, exports) {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}

function clear(paths) {
  for (const path of paths) delete require.cache[path];
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function loadInviteModel(onQuery) {
  clear([invitePath, dbPath]);
  mockModule(dbPath, {
    pool: {
      async query(sql, params) {
        return onQuery(String(sql), params);
      },
    },
  });
  return require('../models/Invite').Invite;
}

function loadAdminController({ inviteImpl }) {
  clear([adminControllerPath, invitePath, adminComplexPath, dbPath, accountEmailPath]);
  mockModule(invitePath, { Invite: inviteImpl });
  mockModule(adminComplexPath, { AdminComplex: {} });
  mockModule(dbPath, { pool: { async query() { return { rows: [] }; } } });
  mockModule(accountEmailPath, { sendResidentInviteEmail: async () => ({}) });
  return require('../controllers/adminController');
}

test('Invite.listByCommunity keeps the listing inside its community and returns metadata only', async () => {
  let capturedSql = '';
  let capturedParams = null;
  const localInvite = {
    id: 41,
    email: 'resident@example.test',
    unit_id: 11,
    unit_number: 'A-101',
    ownership_type: 'owner',
    expires_at: '2026-09-12T12:00:00.000Z',
    used: false,
    status: 'pending',
    created_at: '2026-09-05T12:00:00.000Z',
  };
  const Invite = loadInviteModel(async (sql, params) => {
    capturedSql = sql;
    capturedParams = params;
    return { rows: params?.[0] === 7 ? [localInvite] : [localInvite, { id: 99, email: 'foreign@example.test' }] };
  });

  const rows = await Invite.listByCommunity(7);

  assert.deepEqual(rows, [localInvite]);
  assert.match(capturedSql, /i\.community_id\s*=\s*\$1/i);
  assert.match(capturedSql, /WHEN i\.used IS TRUE THEN 'used'/i);
  assert.match(capturedSql, /i\.expires_at <= NOW\(\).*'expired'/i);
  assert.doesNotMatch(capturedSql, /token_hash|\bi\.token\b/i);
  assert.deepEqual(capturedParams, [7]);
});

test('admin listing binds req.communityId and omits invitation credentials', async () => {
  let receivedCommunity;
  const controller = loadAdminController({
    inviteImpl: {
      async listByCommunity(communityId) {
        receivedCommunity = communityId;
        return [{
          id: 41,
          email: 'resident@example.test',
          unit_id: 11,
          unit_number: 'A-101',
          ownership_type: 'owner',
          expires_at: '2026-09-12T12:00:00.000Z',
          used: false,
          status: 'pending',
          created_at: '2026-09-05T12:00:00.000Z',
        }];
      },
    },
  });
  const res = response();

  await controller.listInvites({ communityId: 7, user: { id: 2, role: 'admin' } }, res);

  assert.equal(receivedCommunity, 7);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{
    id: 41,
    email: 'resident@example.test',
    unit_id: 11,
    unit_number: 'A-101',
    ownership_type: 'owner',
    expires_at: '2026-09-12T12:00:00.000Z',
    used: false,
    status: 'pending',
    created_at: '2026-09-05T12:00:00.000Z',
  }]);
  assert.equal(Object.hasOwn(res.body[0], 'token'), false);
  assert.equal(Object.hasOwn(res.body[0], 'token_hash'), false);
});

function authFor(role) {
  return {
    authenticate(req, res, next) {
      req.user = { id: 2, role };
      next();
    },
  };
}

function routeController() {
  return {
    invite(req, res) {
      res.status(201).json({});
    },
    listInvites(req, res) {
      res.json([{ id: 41, email: 'resident@example.test', status: 'pending' }]);
    },
    listCommunities(req, res) {
      res.json([]);
    },
  };
}

async function requestAdminRoute(role, method, path) {
  clear([adminRoutePath, adminControllerPath, auditControllerPath, authPath, setCommunityPath, dbPath]);
  mockModule(authPath, authFor(role));
  mockModule(setCommunityPath, {
    setCommunity(req, res, next) {
      req.communityId = 7;
      next();
    },
  });
  mockModule(dbPath, { pool: { async query() { return { rows: [] }; } } });
  mockModule(adminControllerPath, routeController());
  mockModule(auditControllerPath, { list(req, res) { res.json([]); } });

  const app = express();
  app.use('/api/admin', require('../routes/admin'));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  try {
    const routeResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`, { method });
    return { status: routeResponse.status };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('only admins can list resident invitations', async () => {
  assert.equal((await requestAdminRoute('admin', 'GET', '/invites')).status, 200);
  assert.equal((await requestAdminRoute('residente', 'GET', '/invites')).status, 403);
  assert.equal((await requestAdminRoute('access_operator', 'GET', '/invites')).status, 403);
});
