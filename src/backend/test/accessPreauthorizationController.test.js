const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/accessPreauthorizationController');
const modelPath = require.resolve('../models/VisitorPreauthorization');

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
    VisitorPreauthorization: {
      async list() {
        return [];
      },
      async searchPending() {
        return [];
      },
      async findByIdForCommunity() {
        return null;
      },
      async create(data) {
        return { id: 1, ...data, status: 'pending' };
      },
      async cancel() {
        return { id: 1, status: 'cancelled' };
      },
      async use() {
        return {
          alreadyUsed: false,
          preauthorization: { id: 1, status: 'used', used_access_log_id: 50 },
          visit: { id: 50, status: 'inside' },
        };
      },
      ...model,
    },
  });
  return require('../controllers/accessPreauthorizationController');
}

test('admin creates preauthorization scoped to validated community', async () => {
  let payload = null;
  const controller = loadController({
    async create(data) {
      payload = data;
      return { id: 3, ...data, status: 'pending' };
    },
  });
  const res = createResponse();

  await controller.create({
    communityId: 7,
    complexId: 22,
    user: { id: 10, role: 'admin' },
    body: { visitor_name: 'Ana Perez', visit_type: 'guest', destination_label: 'A1' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(payload.community_id, 7);
  assert.equal(payload.complex_id, 22);
  assert.equal(payload.created_by, 10);
  assert.equal(res.body.preauthorization.status, 'pending');
});

test('admin cannot create preauthorization with unit outside community', async () => {
  let created = false;
  const err = new Error('UNIT_FORBIDDEN');
  err.code = 'UNIT_FORBIDDEN';
  const controller = loadController({
    async create() {
      created = true;
      throw err;
    },
  });
  const res = createResponse();

  await controller.create({
    communityId: 1,
    user: { id: 10, role: 'admin' },
    body: { visitor_name: 'Ana Perez', visit_type: 'guest', unit_id: 999 },
  }, res);

  assert.equal(created, true);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'La unidad no pertenece a tu comunidad' });
});

test('guard search uses validated request community and complex context', async () => {
  let receivedCommunityId = null;
  let receivedFilters = null;
  const controller = loadController({
    async searchPending(communityId, filters) {
      receivedCommunityId = communityId;
      receivedFilters = filters;
      return [{ id: 1, visitor_name: 'Ana Perez', status: 'pending' }];
    },
  });
  const res = createResponse();

  await controller.search({
    communityId: 4,
    complexId: 9,
    user: { id: 11, role: 'access_operator' },
    query: { q: 'Ana' },
  }, res);

  assert.equal(receivedCommunityId, 4);
  assert.equal(receivedFilters.complex_id, 9);
  assert.equal(receivedFilters.q, 'Ana');
  assert.equal(res.body.data.length, 1);
});

test('using a preauthorization returns created access log and used status', async () => {
  const controller = loadController({
    async use({ id, communityId, userId }) {
      assert.equal(id, 8);
      assert.equal(communityId, 2);
      assert.equal(userId, 11);
      return {
        alreadyUsed: false,
        preauthorization: { id: 8, status: 'used', used_access_log_id: 77 },
        visit: { id: 77, status: 'inside', preauthorization_id: 8 },
      };
    },
  });
  const res = createResponse();

  await controller.use({
    params: { id: '8' },
    communityId: 2,
    user: { id: 11, role: 'access_operator' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.preauthorization.status, 'used');
  assert.equal(res.body.visit.preauthorization_id, 8);
});

test('repeated preauthorization use is idempotent and does not duplicate visit', async () => {
  const controller = loadController({
    async use() {
      return {
        alreadyUsed: true,
        preauthorization: { id: 8, status: 'used', used_access_log_id: 77 },
        visit: { id: 77, status: 'inside', preauthorization_id: 8 },
      };
    },
  });
  const res = createResponse();

  await controller.use({
    params: { id: '8' },
    communityId: 2,
    user: { id: 11, role: 'access_operator' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'La preautorización ya había sido usada.');
  assert.equal(res.body.visit.id, 77);
});

test('cancel marks preauthorization as cancelled without deleting it', async () => {
  const controller = loadController({
    async cancel({ id, communityId, userId }) {
      assert.equal(id, 5);
      assert.equal(communityId, 1);
      assert.equal(userId, 10);
      return { id: 5, status: 'cancelled', cancelled_at: '2026-01-01T00:00:00.000Z' };
    },
  });
  const res = createResponse();

  await controller.cancel({
    params: { id: '5' },
    communityId: 1,
    user: { id: 10, role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.preauthorization.status, 'cancelled');
});
