const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/accessInvitationController');
const modelPath = require.resolve('../models/VisitorDigitalInvitation');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function createResponse() {
  return {
    statusCode: 200,
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

function loadController(model = {}) {
  delete require.cache[controllerPath];
  mockModule(modelPath, {
    VisitorDigitalInvitation: {
      async list() {
        return [];
      },
      async create() {
        return {
          invitation: { id: 1, preauthorization_id: 3, status: 'active', token_hint: 'abcdef12' },
          token: 'abcdef123456',
        };
      },
      async revoke() {
        return { id: 1, status: 'revoked', revoked_at: '2026-01-01T00:00:00.000Z' };
      },
      ...model,
    },
  });
  return require('../controllers/accessInvitationController');
}

test('admin generates invitation for own pending preauthorization', async () => {
  let payload = null;
  const controller = loadController({
    async create(data) {
      payload = data;
      return {
        invitation: { id: 9, preauthorization_id: data.preauthorizationId, status: 'active', token_hint: 'tok12345' },
        token: 'tok123456789',
      };
    },
  });
  const res = createResponse();

  await controller.create({
    params: { id: '44' },
    protocol: 'https',
    get() { return 'app.test'; },
    communityId: 7,
    user: { id: 10, role: 'admin' },
    body: {},
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(payload.preauthorizationId, 44);
  assert.equal(payload.communityId, 7);
  assert.equal(payload.userId, 10);
  assert.equal(res.body.token, 'tok123456789');
  assert.equal(res.body.invitation_url, 'https://app.test/invitacion/tok123456789');
});

test('admin cannot generate invitation for preauthorization outside request community', async () => {
  const controller = loadController({
    async create() {
      return null;
    },
  });
  const res = createResponse();

  await controller.create({
    params: { id: '44' },
    protocol: 'https',
    get() { return 'app.test'; },
    communityId: 7,
    user: { id: 10, role: 'admin' },
    body: {},
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Preautorización no encontrada' });
});

test('admin cannot generate invitation for used or cancelled preauthorization', async () => {
  const err = new Error('PREAUTH_NOT_PENDING');
  err.code = 'PREAUTH_NOT_PENDING';
  const controller = loadController({
    async create() {
      throw err;
    },
  });
  const res = createResponse();

  await controller.create({
    params: { id: '44' },
    protocol: 'https',
    get() { return 'app.test'; },
    communityId: 7,
    user: { id: 10, role: 'admin' },
    body: {},
  }, res);

  assert.equal(res.statusCode, 409);
});

test('admin lists invitations for own preauthorization', async () => {
  let received = null;
  const controller = loadController({
    async list(data) {
      received = data;
      return [{ id: 1, status: 'active' }];
    },
  });
  const res = createResponse();

  await controller.list({
    params: { id: '8' },
    communityId: 2,
    user: { id: 10, role: 'admin' },
  }, res);

  assert.equal(received.preauthorizationId, 8);
  assert.equal(received.communityId, 2);
  assert.equal(res.body.data.length, 1);
});

test('admin revokes active invitation', async () => {
  const controller = loadController({
    async revoke(data) {
      assert.equal(data.id, 5);
      assert.equal(data.preauthorizationId, 8);
      assert.equal(data.communityId, 2);
      return { id: 5, status: 'revoked', revoked_at: '2026-01-01T00:00:00.000Z' };
    },
  });
  const res = createResponse();

  await controller.revoke({
    params: { id: '8', invitationId: '5' },
    communityId: 2,
    user: { id: 10, role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.invitation.status, 'revoked');
});

test('revoking twice is safe and idempotent', async () => {
  const controller = loadController({
    async revoke() {
      return { id: 5, alreadyRevoked: true, revoked_at: '2026-01-01T00:00:00.000Z' };
    },
  });
  const res = createResponse();

  await controller.revoke({
    params: { id: '8', invitationId: '5' },
    communityId: 2,
    user: { id: 10, role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'La invitación ya estaba revocada.');
});
