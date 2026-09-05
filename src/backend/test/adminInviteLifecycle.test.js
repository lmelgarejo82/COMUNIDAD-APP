const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');

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

function loadAdminController({ inviteImpl, sendResidentInviteEmail = async () => ({}) }) {
  clear([adminControllerPath, invitePath, adminComplexPath, dbPath, accountEmailPath]);
  mockModule(invitePath, { Invite: inviteImpl });
  mockModule(adminComplexPath, { AdminComplex: {} });
  mockModule(dbPath, { pool: { async query() { return { rows: [] }; } } });
  mockModule(accountEmailPath, { sendResidentInviteEmail });
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
    resendInvite(req, res) {
      res.json({ id: Number(req.params.id), community: req.communityId });
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

const sha256 = token => crypto.createHash('sha256').update(token).digest('hex');

function pendingRow(overrides = {}) {
  return {
    id: 41, email: 'resident@example.test', community_id: 7, unit_id: 11,
    unit_number: 'A-101', ownership_type: 'tenant', used: false,
    expires_at: new Date(Date.now() + 3600000), created_at: new Date('2026-09-01'),
    ...overrides,
  };
}

// PostgreSQL is external: assert its SQL boundary and model READ COMMITTED row
// locking with predicate re-evaluation AFTER waiting for the previous commit.
function rotationDatabase({ row = pendingRow(), unitCommunity = 7, active = true,
  deleted = null, failAt, failRollback = false, holdFirstLock = false } = {}) {
  const state = { row, hash: sha256('1'.repeat(64)), events: [], calls: [], inserts: 0,
    releases: [], returnedOpenTransactions: 0, operationError: new Error('database failure') };
  let lockTail = Promise.resolve();
  let clientCount = 0;
  let openFirstLock;
  let firstLocked;
  let secondWaiting;
  state.firstLocked = new Promise(resolve => { firstLocked = resolve; });
  state.secondWaiting = new Promise(resolve => { secondWaiting = resolve; });
  const firstGate = new Promise(resolve => { openFirstLock = resolve; });
  state.openFirstLock = openFirstLock;
  state.pool = {
    async connect() {
      const clientId = ++clientCount;
      let unlock;
      let draft;
      let transactionOpen = false;
      return {
        async query(sql, params) {
          sql = String(sql).trim();
          state.calls.push({ sql, params, clientId });
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
            state.events.push(sql);
            if (sql === 'ROLLBACK' && failRollback) throw new Error('rollback transport failure');
            if (sql === failAt) throw state.operationError;
            transactionOpen = sql === 'BEGIN';
            if (sql === 'COMMIT' && draft) Object.assign(state, draft);
            if (sql !== 'BEGIN' && unlock) { unlock(); unlock = null; }
            return { rows: [] };
          }
          if (/^SELECT/.test(sql)) {
            state.events.push('LOCK');
            assert.match(sql, /WHERE i\.id = \$1[\s\S]*i\.community_id = \$2/);
            assert.match(sql, /i\.used IS NOT TRUE[\s\S]*i\.expires_at > NOW\(\)/);
            assert.match(sql, /cx\.community_id = \$2/);
            assert.match(sql, /COALESCE\(un\.is_active, TRUE\) = TRUE/);
            for (const alias of ['un', 'f', 'b', 'cx']) assert.ok(sql.includes(`${alias}.deleted_at IS NULL`));
            assert.match(sql, /FOR UPDATE OF i, un/);
            const prior = lockTail;
            lockTail = new Promise(resolve => { unlock = resolve; });
            if (clientId === 2) secondWaiting();
            await prior;
            if (clientId === 1) { firstLocked(); if (holdFirstLock) await firstGate; }
            if (failAt === 'LOCK') throw state.operationError;
            const eligible = state.row && Number(params[0]) === state.row.id && params[1] === state.row.community_id
              && state.row.used !== true && state.row.expires_at > new Date()
              && unitCommunity === params[1] && active && !deleted;
            return { rows: eligible ? [{ ...state.row }] : [] };
          }
          if (/^UPDATE invites/.test(sql)) {
            state.events.push('UPDATE');
            assert.match(sql, /SET token_hash = \$1, expires_at = \$2/);
            assert.match(sql, /WHERE id = \$3 AND community_id = \$4 AND used IS NOT TRUE/);
            assert.doesNotMatch(sql, /RETURNING\s+\*|RETURNING[\s\S]*token_hash/i);
            if (failAt === 'UPDATE') throw state.operationError;
            if (failAt === 'LOST') return { rows: [] };
            assert.deepEqual(params.slice(2).map(Number), [41, 7]);
            draft = { hash: params[0], row: { ...state.row, expires_at: params[1] } };
            return { rows: [{ ...draft.row }] };
          }
          if (/INSERT/.test(sql)) state.inserts++;
          throw new Error('unexpected SQL');
        },
        release(discard) {
          state.events.push('RELEASE');
          state.releases.push(Boolean(discard));
          // Returning a client normally does not end an uncertain transaction.
          if (discard) {
            transactionOpen = false;
            if (unlock) { unlock(); unlock = null; }
          } else if (transactionOpen) {
            state.returnedOpenTransactions++;
          }
        },
      };
    },
  };
  clear([invitePath, dbPath]);
  mockModule(dbPath, { pool: state.pool });
  state.Invite = require(invitePath).Invite;
  return state;
}

test('rotatePending locks and updates the same local pending row with hash only', async () => {
  const db = rotationDatabase();
  const started = Date.now();
  const rotated = await db.Invite.rotatePending(41, 7);
  assert.deepEqual(db.events, ['BEGIN', 'LOCK', 'UPDATE', 'COMMIT', 'RELEASE']);
  assert.deepEqual(db.releases, [false]);
  assert.equal(db.returnedOpenTransactions, 0);
  assert.equal(rotated.id, 41);
  assert.equal(rotated.status, 'pending');
  assert.equal(/^[a-f0-9]{64}$/.test(rotated.token), true);
  assert.equal(db.hash === sha256(rotated.token), true);
  assert.equal(db.calls.some(call => call.params?.includes(rotated.token)), false);
  assert.equal(Object.hasOwn(rotated, 'token_hash'), false);
  assert.ok(rotated.expires_at.getTime() >= started + 7 * 86400000);
  assert.ok(rotated.expires_at.getTime() <= Date.now() + 7 * 86400000);
  assert.equal(db.inserts, 0);
});

for (const [name, options, id, community] of [
  ['foreign invitation', {}, 41, 8],
  ['missing invitation', {}, 99, 7],
  ['used invitation', { row: pendingRow({ used: true }) }, 41, 7],
  ['expired invitation', { row: pendingRow({ expires_at: new Date(0) }) }, 41, 7],
  ['inactive unit', { active: false }, 41, 7],
  ['foreign unit', { unitCommunity: 8 }, 41, 7],
  ['deleted hierarchy', { deleted: new Date() }, 41, 7],
]) {
  test(`rotatePending rejects ${name} without update and releases its client`, async () => {
    const db = rotationDatabase(options);
    assert.equal(await db.Invite.rotatePending(id, community), null);
    assert.deepEqual(db.events, ['BEGIN', 'LOCK', 'ROLLBACK', 'RELEASE']);
    assert.deepEqual(db.releases, [false]);
    assert.equal(db.returnedOpenTransactions, 0);
  });
}

for (const failAt of ['BEGIN', 'LOCK', 'UPDATE', 'LOST', 'COMMIT']) {
  test(`rotatePending preserves persisted token and releases on ${failAt} failure`, async () => {
    const db = rotationDatabase({ failAt });
    await assert.rejects(() => db.Invite.rotatePending(41, 7), failAt === 'LOST' ? /INVITE_ROTATION_LOST/ : /database failure/);
    assert.equal(db.hash === sha256('1'.repeat(64)), true);
    assert.equal(db.events.at(-1), 'RELEASE');
    assert.equal(db.events.includes('ROLLBACK'), failAt !== 'BEGIN');
    assert.deepEqual(db.releases, [false]);
    assert.equal(db.returnedOpenTransactions, 0);
  });
}

for (const failAt of ['LOST', 'LOCK']) {
  test(`failed rollback discards the client while preserving the ${failAt} operation error`, async () => {
    const db = rotationDatabase({ failAt, failRollback: true });
    const logs = [];
    const originalError = console.error;
    console.error = (...args) => logs.push(args);
    try {
      await assert.rejects(() => db.Invite.rotatePending(41, 7),
        failAt === 'LOST' ? /INVITE_ROTATION_LOST/ : error => error === db.operationError);
    } finally { console.error = originalError; }
    assert.equal(db.returnedOpenTransactions, 0);
    assert.deepEqual(db.releases, [true]);
    assert.equal(db.events.at(-1), 'RELEASE');
    assert.deepEqual(logs, [['Error en rollback de invitación.']]);
  });
}

test('failed rollback after rejecting an invitation discards the client and still returns null', async () => {
  const db = rotationDatabase({ row: null, failRollback: true });
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    assert.equal(await db.Invite.rotatePending(41, 7), null);
  } finally { console.error = originalError; }
  assert.equal(db.returnedOpenTransactions, 0);
  assert.deepEqual(db.releases, [true]);
  assert.deepEqual(db.events, ['BEGIN', 'LOCK', 'ROLLBACK', 'RELEASE']);
  assert.deepEqual(logs, [['Error en rollback de invitación.']]);
});

test('concurrent rotations serialize on the same row and only the last token is accepted', async () => {
  const db = rotationDatabase({ holdFirstLock: true });
  assert.equal(typeof db.Invite.rotatePending, 'function');
  const firstPromise = db.Invite.rotatePending(41, 7);
  await db.firstLocked;
  const secondPromise = db.Invite.rotatePending(41, 7);
  await db.secondWaiting;
  assert.equal(db.events.includes('UPDATE'), false);
  db.openFirstLock();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.deepEqual([first.id, second.id], [41, 41]);
  assert.equal(first.token !== second.token, true);
  assert.equal(db.hash === sha256(second.token), true);
  const acceptanceClient = { async query(sql, params) {
    assert.match(sql, /WHERE i\.token_hash = \$1/);
    assert.match(sql, /FOR UPDATE OF i, un/);
    return { rows: params[0] === db.hash ? [db.row] : [] };
  } };
  assert.equal(await db.Invite.findForAcceptance(first.token, acceptanceClient), null);
  assert.equal((await db.Invite.findForAcceptance(second.token, acceptanceClient)).id, 41);
  assert.equal(db.inserts, 0);
  const writes = db.calls.filter(call => /^UPDATE|^COMMIT/.test(call.sql));
  assert.deepEqual(writes.map(call => call.clientId), [1, 1, 2, 2]);
});

function resendRequest(id = '41', communityId = 7) {
  return { params: { id }, communityId, user: { id: 2, role: 'admin' },
    body: { community_id: 8, email: 'attacker@example.test' },
    headers: { host: 'attacker.example', 'x-forwarded-host': 'attacker.example' } };
}

for (const smtpFails of [false, true]) {
  test(`resend commits before SMTP and returns safe metadata on SMTP ${smtpFails ? 'failure' : 'success'}`, async () => {
    const db = rotationDatabase();
    let sentMail;
    const logs = [];
    const controller = loadAdminController({ inviteImpl: db.Invite,
      sendResidentInviteEmail: async mail => {
        assert.deepEqual(db.events, ['BEGIN', 'LOCK', 'UPDATE', 'COMMIT', 'RELEASE']);
        sentMail = mail;
        if (smtpFails) throw new Error(JSON.stringify({ ...mail, credential: 'smtp-secret' }));
      } });
    const res = response();
    const originalError = console.error;
    console.error = (...args) => logs.push(args);
    try { await controller.resendInvite(resendRequest(), res); }
    finally { console.error = originalError; }
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, 41);
    assert.equal(res.body.email_sent, !smtpFails);
    assert.equal(res.body.message, smtpFails ? 'Invitación renovada' : 'Invitación reenviada');
    if (smtpFails) assert.match(res.body.delivery_warning, /renovada.*no se pudo enviar/i);
    else assert.equal(res.body.delivery_warning, null);
    assert.deepEqual(Object.keys(res.body).sort(), ['id', 'email', 'unit_id', 'unit_number', 'ownership_type',
      'expires_at', 'used', 'created_at', 'status', 'message', 'email_sent', 'delivery_warning'].sort());
    assert.equal(sentMail.email, 'resident@example.test');
    assert.equal(sentMail.unitNumber, 'A-101');
    assert.equal(sentMail.ownershipType, 'tenant');
    const url = new URL(sentMail.inviteUrl);
    assert.equal(url.origin, 'http://localhost.test');
    assert.equal(url.pathname, '/register');
    assert.equal(url.search, '');
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    assert.equal(db.hash === sha256(token), true);
    assert.equal(JSON.stringify(res.body).includes(token), false);
    assert.equal(JSON.stringify(res.body).includes(db.hash), false);
    if (smtpFails) {
      assert.equal(logs.length, 1);
      assert.equal(logs[0].length, 1);
      assert.equal(typeof logs[0][0], 'string');
      for (const secret of [token, db.hash, sentMail.email, sentMail.inviteUrl, 'smtp-secret']) {
        assert.equal(JSON.stringify(logs).includes(secret), false);
      }
    }
  });
}

for (const [name, options, id, community] of [
  ['foreign', {}, '41', 8], ['missing', {}, '99', 7],
  ['used', { row: pendingRow({ used: true }) }, '41', 7],
  ['expired', { row: pendingRow({ expires_at: new Date(0) }) }, '41', 7],
]) {
  test(`resend gives the same safe 404 for ${name} invitation without SMTP`, async () => {
    const db = rotationDatabase(options);
    let emailAttempts = 0;
    const controller = loadAdminController({ inviteImpl: db.Invite,
      sendResidentInviteEmail: async () => { emailAttempts++; } });
    const res = response();
    await controller.resendInvite(resendRequest(id, community), res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Invitación pendiente no encontrada' });
    assert.equal(emailAttempts, 0);
  });
}

test('resend database failure returns 500 with no email attempt', async () => {
  const db = rotationDatabase({ failAt: 'COMMIT' });
  let emailAttempts = 0;
  const controller = loadAdminController({ inviteImpl: db.Invite,
    sendResidentInviteEmail: async () => { emailAttempts++; } });
  const res = response();
  const originalError = console.error;
  console.error = () => {};
  try { await controller.resendInvite(resendRequest(), res); }
  finally { console.error = originalError; }
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error interno del servidor' });
  assert.equal(emailAttempts, 0);
});

test('only admins can resend resident invitations', async () => {
  assert.equal((await requestAdminRoute('admin', 'POST', '/invites/41/resend')).status, 200);
  assert.equal((await requestAdminRoute('residente', 'POST', '/invites/41/resend')).status, 403);
  assert.equal((await requestAdminRoute('access_operator', 'POST', '/invites/41/resend')).status, 403);
});
