const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/accessInvitationValidationController');
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
      async validateToken() {
        return {
          invitation_id: 1,
          preauthorization_id: 2,
          visitor_name: 'Ana Perez',
          visitor_document: '*****123',
          visit_type: 'guest',
          unit_id: 10,
          destination_label: 'Torre A · Piso 1 · Unidad A1',
          authorized_by: 'Administracion',
          expected_from: null,
          expected_until: null,
          status: 'active',
        };
      },
      async useToken() {
        return {
          alreadyUsed: false,
          invitation: { invitation_id: 1, preauthorization_id: 2, status: 'used' },
          visit: { id: 50, status: 'inside', preauthorization_id: 2 },
          preauthorization: { id: 2, status: 'used' },
        };
      },
      ...model,
    },
  });
  return require('../controllers/accessInvitationValidationController');
}

test('validate with valid token returns minimal summary', async () => {
  let received = null;
  const controller = loadController({
    async validateToken(data) {
      received = data;
      return { invitation_id: 5, preauthorization_id: 9, visitor_name: 'Ana Perez', visitor_document: '***123', status: 'active' };
    },
  });
  const res = createResponse();

  await controller.validate({
    communityId: 3,
    user: { id: 11, role: 'access_operator' },
    body: { token: 'opaque-token' },
  }, res);

  assert.equal(received.token, 'opaque-token');
  assert.equal(received.communityId, 3);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.invitation, { invitation_id: 5, preauthorization_id: 9, visitor_name: 'Ana Perez', visitor_document: '***123', status: 'active' });
});

test('validate with missing token returns bad request', async () => {
  const controller = loadController();
  const res = createResponse();

  await controller.validate({ communityId: 3, body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Token requerido' });
});

test('validate with nonexistent token returns generic error', async () => {
  const err = new Error('INVITATION_INVALID');
  err.code = 'INVITATION_INVALID';
  const controller = loadController({
    async validateToken() {
      throw err;
    },
  });
  const res = createResponse();

  await controller.validate({ communityId: 3, body: { token: 'missing' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Invitación inválida o vencida.' });
});

test('validate with expired or revoked token returns same generic error', async () => {
  const err = new Error('INVITATION_INVALID');
  err.code = 'INVITATION_INVALID';
  const controller = loadController({
    async validateToken() {
      throw err;
    },
  });
  const res = createResponse();

  await controller.validate({ communityId: 3, body: { token: 'expired-or-revoked' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Invitación inválida o vencida.' });
});

test('use with valid token creates access log from invitation', async () => {
  let received = null;
  const controller = loadController({
    async useToken(data) {
      received = data;
      return {
        alreadyUsed: false,
        invitation: { invitation_id: 5, preauthorization_id: 9, status: 'used' },
        visit: { id: 44, status: 'inside', preauthorization_id: 9 },
        preauthorization: { id: 9, status: 'used' },
      };
    },
  });
  const res = createResponse();

  await controller.use({
    communityId: 3,
    user: { id: 11, role: 'access_operator' },
    body: { token: 'opaque-token' },
  }, res);

  assert.equal(received.communityId, 3);
  assert.equal(received.userId, 11);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.visit.id, 44);
});

test('repeated use with same token is idempotent', async () => {
  const controller = loadController({
    async useToken() {
      return {
        alreadyUsed: true,
        invitation: { invitation_id: 5, preauthorization_id: 9, status: 'used', access_log_id: 44 },
        visit: { id: 44, status: 'inside', preauthorization_id: 9 },
      };
    },
  });
  const res = createResponse();

  await controller.use({ communityId: 3, user: { id: 11 }, body: { token: 'opaque-token' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'La invitación ya había sido usada.');
  assert.equal(res.body.visit.id, 44);
});

test('invitation from another community is blocked with generic error', async () => {
  const err = new Error('INVITATION_INVALID');
  err.code = 'INVITATION_INVALID';
  const controller = loadController({
    async validateToken() {
      throw err;
    },
  });
  const res = createResponse();

  await controller.validate({ communityId: 99, body: { token: 'other-community' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Invitación inválida o vencida.' });
});
