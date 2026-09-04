const test = require('node:test');
const assert = require('node:assert/strict');

const authControllerPath = require.resolve('../controllers/authController');
const userControllerPath = require.resolve('../controllers/userController');
const pollsControllerPath = require.resolve('../controllers/pollsController');
const userPath = require.resolve('../models/User');
const invitePath = require.resolve('../models/Invite');
const pollPath = require.resolve('../models/Poll');
const dbPath = require.resolve('../db');
const bcryptPath = require.resolve('bcryptjs');
const jwtPath = require.resolve('jsonwebtoken');
const nodemailerPath = require.resolve('nodemailer');

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

function transactionClient(events, { failOwnership = false } = {}) {
  return {
    async query(sql, params) {
      const normalized = String(sql).trim();
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        events.push(normalized);
        return { rows: [] };
      }
      if (/INSERT INTO unit_ownerships/.test(sql)) {
        events.push(['ownership', params]);
        if (failOwnership) throw new Error('forced ownership failure');
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    release() { events.push('RELEASE'); },
  };
}

function loadAuth({ user, community, invite, client }) {
  clear([authControllerPath, userPath, invitePath, dbPath, bcryptPath, jwtPath, nodemailerPath]);
  mockModule(userPath, { User: user, Community: community });
  mockModule(invitePath, { Invite: invite });
  mockModule(dbPath, { pool: { connect: async () => client } });
  mockModule(bcryptPath, { hash: async () => 'password-hash', compare: async () => true });
  mockModule(jwtPath, { sign: () => 'jwt-token' });
  mockModule(nodemailerPath, { createTransport: () => ({ sendMail: async () => ({}) }) });
  return require('../controllers/authController');
}

test('public registration is disabled by default before any identity lookup', async () => {
  delete process.env.PUBLIC_REGISTRATION_ENABLED;
  let touched = false;
  const { register } = loadAuth({
    user: { findByEmail: async () => { touched = true; } },
    community: { findByAccessCode: async () => { touched = true; } },
    invite: {},
    client: null,
  });
  const res = response();

  await register({ body: {
    email: 'attacker@example.test', password: 'Secure123!', access_code: 'KNOWN',
    role: 'admin', user_type: 'owner', unit_number: 'A-101', communityId: 99,
  } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(touched, false);
});

test('explicit demo registration ignores trusted claims and creates no unit membership', async () => {
  process.env.PUBLIC_REGISTRATION_ENABLED = 'true';
  let created;
  const { register } = loadAuth({
    user: {
      findByEmail: async () => null,
      create: async payload => { created = payload; return { id: 5, email: payload.email, ...payload }; },
    },
    community: { findByAccessCode: async () => ({ id: 7 }) },
    invite: {},
    client: null,
  });
  const res = response();

  try {
    await register({ body: {
      email: 'demo@example.test', password: 'Secure123!', access_code: 'DEMO',
      role: 'admin', user_type: 'owner', ownership_type: 'owner', unit_number: 'FOREIGN',
      unit_id: 99, communityId: 99, community_id: 99,
    } }, res);
  } finally {
    delete process.env.PUBLIC_REGISTRATION_ENABLED;
  }

  assert.equal(res.statusCode, 201);
  assert.deepEqual(created, {
    email: 'demo@example.test', password_hash: 'password-hash', role: 'residente',
    user_type: null, unit_number: null, unit_id: null, community_id: 7,
  });
});

test('demo registration preserves duplicate and invalid access-code errors', async () => {
  process.env.PUBLIC_REGISTRATION_ENABLED = 'true';
  try {
    const duplicateController = loadAuth({
      user: { findByEmail: async () => ({ id: 1 }) },
      community: { findByAccessCode: async () => { throw new Error('must not resolve'); } },
      invite: {}, client: null,
    });
    const duplicateRes = response();
    await duplicateController.register({ body: { email: 'used@example.test', password: 'Secure123!', access_code: 'DEMO' } }, duplicateRes);
    assert.equal(duplicateRes.statusCode, 409);

    const invalidController = loadAuth({
      user: { findByEmail: async () => null },
      community: { findByAccessCode: async () => null },
      invite: {}, client: null,
    });
    const invalidRes = response();
    await invalidController.register({ body: { email: 'new@example.test', password: 'Secure123!', access_code: 'INVALID' } }, invalidRes);
    assert.equal(invalidRes.statusCode, 404);
  } finally {
    delete process.env.PUBLIC_REGISTRATION_ENABLED;
  }
});

test('login returns the authoritative ownership-backed identity', async () => {
  const identity = {
    id: 5, email: 'resident@example.test', role: 'residente', user_type: 'tenant',
    unit_number: 'A-101', unit_id: 11, community_id: 7,
  };
  const { login } = loadAuth({
    user: {
      findByEmail: async () => ({ id: 5, email: identity.email, role: 'residente', password_hash: 'stored' }),
      findById: async () => identity,
    },
    community: {}, invite: {}, client: null,
  });
  const res = response();

  await login({ body: { email: identity.email, password: 'Secure123!' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { user: identity, token: 'jwt-token' });
});

test('invite acceptance atomically uses only admin-selected identity claims', async () => {
  const events = [];
  const client = transactionClient(events);
  let created;
  const inviteRow = {
    id: 20, email: 'resident@example.test', community_id: 7, unit_id: 11,
    resolved_unit_number: 'A-101', ownership_type: 'tenant',
  };
  const { register } = loadAuth({
    user: {
      findByEmail: async (email, db) => { assert.equal(db, client); events.push('email-check'); return null; },
      create: async (payload, db) => {
        assert.equal(db, client);
        created = payload;
        events.push('user');
        return { id: 90, ...payload };
      },
      findById: async (id, db) => {
        assert.equal(db, client);
        events.push('identity');
        return { id, email: inviteRow.email, role: 'residente', user_type: 'tenant', unit_number: 'A-101', unit_id: 11, community_id: 7 };
      },
    },
    community: {},
    invite: {
      findForAcceptance: async (token, db) => { assert.equal(db, client); events.push('invite-lock'); return inviteRow; },
      markUsed: async (id, db) => { assert.equal(db, client); events.push('consume'); return true; },
    },
    client,
  });
  const res = response();

  await register({ body: {
    email: inviteRow.email, password: 'Secure123!', inviteToken: 'trusted-token',
    role: 'admin', user_type: 'owner', ownership_type: 'owner', unit_number: 'FOREIGN',
    unit_id: 99, community_id: 99,
  } }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(created, {
    email: inviteRow.email, password_hash: 'password-hash', role: 'residente',
    user_type: 'tenant', unit_number: 'A-101', unit_id: 11, community_id: 7,
  });
  assert.deepEqual(events, [
    'BEGIN', 'invite-lock', 'email-check', 'user', ['ownership', [11, 90, 'tenant']],
    'identity', 'consume', 'COMMIT', 'RELEASE',
  ]);
});

test('a new owner invite creates an authoritative owner relationship', async () => {
  const events = [];
  const client = transactionClient(events);
  const inviteRow = {
    id: 22, email: 'owner@example.test', community_id: 7, unit_id: 12,
    resolved_unit_number: 'A-102', ownership_type: 'owner',
  };
  let created;
  const { register } = loadAuth({
    user: {
      findByEmail: async () => null,
      create: async (payload) => {
        created = payload;
        events.push('user');
        return { id: 92, ...payload };
      },
      findById: async () => ({ id: 92, ...created }),
    },
    community: {},
    invite: {
      findForAcceptance: async () => { events.push('invite-lock'); return inviteRow; },
      markUsed: async () => { events.push('consume'); return true; },
    },
    client,
  });
  const res = response();

  await register({ body: { email: inviteRow.email, password: 'Secure123!', inviteToken: 'owner-token' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created.user_type, 'owner');
  assert.deepEqual(events.find(event => Array.isArray(event)), ['ownership', [12, 92, 'owner']]);
  assert.ok(events.includes('COMMIT'));
});

test('failed ownership creation rolls back user and leaves invite unconsumed', async () => {
  const events = [];
  const client = transactionClient(events, { failOwnership: true });
  let consumed = false;
  const { register } = loadAuth({
    user: {
      findByEmail: async () => null,
      create: async payload => { events.push('user'); return { id: 91, ...payload }; },
    },
    community: {},
    invite: {
      findForAcceptance: async () => ({
        id: 21, email: 'failure@example.test', community_id: 7, unit_id: 11,
        resolved_unit_number: 'A-101', ownership_type: 'owner',
      }),
      markUsed: async () => { consumed = true; return true; },
    },
    client,
  });
  const res = response();
  const originalError = console.error;
  console.error = () => {};

  try {
    await register({ body: { email: 'failure@example.test', password: 'Secure123!', inviteToken: 'token' } }, res);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.equal(consumed, false);
  assert.deepEqual(events, ['BEGIN', 'user', ['ownership', [11, 91, 'owner']], 'ROLLBACK', 'RELEASE']);
});

test('a used or concurrently consumed invite cannot create a second user', async () => {
  const events = [];
  const client = transactionClient(events);
  let userCreated = false;
  const { register } = loadAuth({
    user: { create: async () => { userCreated = true; } },
    community: {},
    invite: { findForAcceptance: async () => null },
    client,
  });
  const res = response();

  await register({ body: { email: 'repeat@example.test', password: 'Secure123!', inviteToken: 'used-token' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(userCreated, false);
  assert.deepEqual(events, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

function loadUserController(user) {
  clear([userControllerPath, userPath, bcryptPath]);
  mockModule(userPath, { User: user });
  mockModule(bcryptPath, { compare: async () => true, hash: async () => 'hash' });
  return require('../controllers/userController');
}

test('/users/me rejects membership changes before writing', async () => {
  let updated = false;
  const { updateMe } = loadUserController({ updateProfile: async () => { updated = true; } });
  const res = response();

  await updateMe({ user: { id: 5, email: 'resident@example.test' }, body: { unit_number: 'B-202' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(updated, false);
});

test('/users/me preserves normal email profile edits', async () => {
  let updated;
  const { updateMe } = loadUserController({
    findByEmail: async email => email === 'old@example.test' ? { id: 5, email, password_hash: 'hash' } : null,
    updateProfile: async (id, payload) => { updated = [id, payload]; },
    findById: async () => ({ id: 5, email: 'new@example.test', role: 'residente', community_id: 7 }),
  });
  const res = response();

  await updateMe({ user: { id: 5, email: 'old@example.test' }, body: { email: 'new@example.test' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updated, [5, { email: 'new@example.test' }]);
  assert.equal(res.body.email, 'new@example.test');
});

test('poll owner authorization derives from active tenant-scoped ownership', async () => {
  let checked;
  let voted = false;
  clear([pollsControllerPath, pollPath, userPath]);
  mockModule(pollPath, { Poll: {
    findById: async () => ({ id: 41, options: ['Sí', 'No'] }),
    hasVoted: async () => false,
    vote: async () => { voted = true; },
  } });
  mockModule(userPath, { User: {
    hasActiveOwnership: async (...args) => { checked = args; return false; },
  } });
  const { vote } = require('../controllers/pollsController');
  const res = response();

  await vote({ params: { id: '41' }, body: { option_index: 0 }, user: { id: 5 }, communityId: 7 }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(checked, [5, 7, 'owner']);
  assert.equal(voted, false);
});
