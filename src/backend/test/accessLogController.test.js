const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/accessLogController');
const modelPath = require.resolve('../models/VisitorAccessLog');
const hierarchyPath = require.resolve('../models/Hierarchy');
const dbPath = require.resolve('../db');

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

function loadController({
  complexes = [{ id: 10, community_id: 1 }],
  unitRows = [{ id: 100, unit_code: 'A1', complex_id: 10 }],
  model = {},
  onDbQuery = null,
} = {}) {
  delete require.cache[controllerPath];

  mockModule(hierarchyPath, {
    Hierarchy: {
      async getComplexes(communityId) {
        return complexes.filter(c => c.community_id === communityId);
      },
    },
  });

  mockModule(dbPath, {
    pool: {
      async query(sql, params) {
        if (onDbQuery) return onDbQuery(sql, params);
        return { rows: unitRows };
      },
    },
  });

  mockModule(modelPath, {
    VisitorAccessLog: {
      async list() {
        return { data: [], total: 0, kpis: {} };
      },
      async findByIdForCommunity() {
        return null;
      },
      async create(data) {
        return { id: 1, ...data, status: 'inside' };
      },
      async checkOut() {
        return { id: 1, status: 'exited' };
      },
      async cancel() {
        return { id: 1, status: 'cancelled' };
      },
      async observe() {
        return { id: 1, is_observed: true };
      },
      async unobserve() {
        return { id: 1, is_observed: false };
      },
      ...model,
    },
  });

  return require('../controllers/accessLogController');
}

test('access log list uses validated request community context', async () => {
  let receivedCommunityId = null;
  let receivedFilters = null;
  const controller = loadController({
    model: {
      async list(communityId, filters) {
        receivedCommunityId = communityId;
        receivedFilters = filters;
        return { data: [{ id: 1 }], total: 1, kpis: { inside: 1 } };
      },
    },
  });
  const res = createResponse();

  await controller.list({
    communityId: 7,
    complexId: 22,
    query: { view: 'inside', search: 'Ana' },
  }, res);

  assert.equal(receivedCommunityId, 7);
  assert.equal(receivedFilters.complex_id, 22);
  assert.equal(receivedFilters.search, 'Ana');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);
});

test('check-in rejects a unit outside the validated community', async () => {
  let created = false;
  const controller = loadController({
    unitRows: [],
    model: {
      async create() {
        created = true;
      },
    },
  });
  const res = createResponse();

  await controller.checkIn({
    communityId: 1,
    complexId: 10,
    user: { id: 5 },
    body: { visitor_name: 'Ana Perez', visit_type: 'guest', unit_id: 999 },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(created, false);
  assert.deepEqual(res.body, { error: 'La unidad no pertenece a tu comunidad' });
});

test('check-in rejects a complex outside the validated community', async () => {
  let created = false;
  const controller = loadController({
    complexes: [{ id: 10, community_id: 1 }],
    model: {
      async create() {
        created = true;
      },
    },
  });
  const res = createResponse();

  await controller.checkIn({
    communityId: 1,
    user: { id: 5 },
    body: { visitor_name: 'Ana Perez', visit_type: 'guest', complex_id: 99 },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(created, false);
  assert.deepEqual(res.body, { error: 'El complejo no pertenece a tu comunidad' });
});

test('check-in creates a visit scoped to req.communityId and resolved unit complex', async () => {
  let payload = null;
  const controller = loadController({
    unitRows: [{ id: 100, unit_code: 'A1', complex_id: 10 }],
    model: {
      async create(data) {
        payload = data;
        return { id: 1, ...data, status: 'inside' };
      },
    },
  });
  const res = createResponse();

  await controller.checkIn({
    communityId: 1,
    user: { id: 5 },
    body: { visitor_name: 'Ana Perez', visit_type: 'guest', unit_id: 100, destination_label: 'A1' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(payload.community_id, 1);
  assert.equal(payload.complex_id, 10);
  assert.equal(payload.unit_id, 100);
  assert.equal(payload.created_by, 5);
});

test('repeated check-out is idempotent', async () => {
  const controller = loadController({
    model: {
      async checkOut({ id, communityId, userId }) {
        assert.equal(id, 1);
        assert.equal(communityId, 1);
        assert.equal(userId, 5);
        return { id: 1, status: 'exited', alreadyExited: true };
      },
    },
  });
  const res = createResponse();

  await controller.checkOut({ params: { id: '1' }, communityId: 1, user: { id: 5 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'La salida ya estaba registrada.');
});

test('cancel marks a visit as cancelled without deleting it', async () => {
  const controller = loadController({
    model: {
      async cancel({ id, communityId }) {
        assert.equal(id, 2);
        assert.equal(communityId, 1);
        return { id: 2, status: 'cancelled', cancelled_at: '2026-01-01T00:00:00.000Z' };
      },
    },
  });
  const res = createResponse();

  await controller.cancel({ params: { id: '2' }, communityId: 1, user: { id: 5 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.visit.status, 'cancelled');
});

test('observe requires an observation note', async () => {
  let observed = false;
  const controller = loadController({
    model: {
      async observe() {
        observed = true;
      },
    },
  });
  const res = createResponse();

  await controller.observe({ params: { id: '1' }, communityId: 1, user: { id: 5 }, body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(observed, false);
  assert.deepEqual(res.body, { error: 'observation_note es requerido' });
});

test('observed and delayed states are returned without changing persistent status', async () => {
  const controller = loadController({
    model: {
      async list() {
        return {
          data: [{ id: 1, status: 'inside', is_observed: true, is_delayed: true }],
          total: 1,
          kpis: { observed_or_delayed: 1 },
        };
      },
    },
  });
  const res = createResponse();

  await controller.list({ communityId: 1, query: { view: 'observed' } }, res);

  assert.equal(res.body.data[0].status, 'inside');
  assert.equal(res.body.data[0].is_observed, true);
  assert.equal(res.body.data[0].is_delayed, true);
});
