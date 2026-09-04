const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/hierarchyController');
const hierarchyPath = require.resolve('../models/Hierarchy');
const adminComplexPath = require.resolve('../models/AdminComplex');
const dbPath = require.resolve('../db');
const cachePath = require.resolve('../cache');

function mockModule(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function loadController({ hierarchyImpl = {}, pool = { async query() { return { rows: [] }; } } } = {}) {
  delete require.cache[controllerPath];
  mockModule(hierarchyPath, {
    Hierarchy: {
      async getComplexes() { return [{ id: 70, community_id: 7 }]; },
      ...hierarchyImpl,
    },
  });
  mockModule(adminComplexPath, { AdminComplex: {} });
  mockModule(dbPath, { pool });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  return require('../controllers/hierarchyController');
}

function buildingRequest(totalLots, includeField = true) {
  const body = {
    complex_id: 70,
    name: 'Barrio Norte',
    building_type: 'house',
  };
  if (includeField) body.total_lots = totalLots;
  return { communityId: 7, body };
}

test('automatic building creation preserves normal, maximum and legacy default inputs', async (t) => {
  const cases = [
    { label: 'normal number', input: 6, expected: 6 },
    { label: 'maximum', input: 200, expected: 200 },
    { label: 'strict numeric string', input: '10', expected: 10 },
    { label: 'null defaults to one', input: null, expected: 1 },
    { label: 'missing defaults to one', input: undefined, expected: 1, includeField: false },
  ];

  for (const item of cases) {
    await t.test(item.label, async () => {
      const calls = [];
      const { createBuilding } = loadController({
        hierarchyImpl: {
          async createBuilding(payload) {
            calls.push(payload);
            return { building: { id: 1 }, floor: { id: 2 }, units: [] };
          },
        },
      });
      const res = response();

      await createBuilding(buildingRequest(item.input, item.includeField !== false), res);

      assert.equal(res.statusCode, 201);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].totalLots, item.expected);
    });
  }
});

test('automatic building creation rejects malformed or excessive work before mutation', async (t) => {
  const cases = [
    ['maximum plus one', 201],
    ['huge integer', 1_000_000_000],
    ['zero', 0],
    ['negative', -1],
    ['decimal number', 2.5],
    ['decimal string', '2.5'],
    ['partially numeric string', '10x'],
    ['nonnumeric string', 'many'],
  ];

  for (const [label, input] of cases) {
    await t.test(label, async () => {
      let mutations = 0;
      const { createBuilding } = loadController({
        hierarchyImpl: {
          async createBuilding() {
            mutations += 1;
            return { building: { id: 1 }, floor: { id: 2 }, units: [] };
          },
        },
      });
      const res = response();

      await createBuilding(buildingRequest(input), res);

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'total_lots debe ser un entero entre 1 y 200' });
      assert.equal(mutations, 0);
    });
  }
});

function bulkPool() {
  const state = { connections: 0, writes: 0, transactions: [] };
  const client = {
    async query(sql) {
      const statement = String(sql).trim();
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
        state.transactions.push(statement);
        return { rows: [] };
      }
      state.writes += 1;
      if (/INSERT INTO buildings/.test(statement)) return { rows: [{ id: 80 }] };
      if (/INSERT INTO floors/.test(statement)) return { rows: [{ id: 90 }] };
      if (/INSERT INTO units/.test(statement)) return { rows: [] };
      throw new Error(`unexpected query: ${statement}`);
    },
    release() {},
  };
  return {
    state,
    async connect() { state.connections += 1; return client; },
  };
}

test('bulk auto-floor creation accepts the established maximum', async () => {
  const pool = bulkPool();
  const { bulkCreate } = loadController({ pool });
  const res = response();

  await bulkCreate({
    communityId: 7,
    complexId: 70,
    body: {
      building: { name: 'Casas', building_type: 'house' },
      total_lots: 200,
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(pool.state.transactions, ['BEGIN', 'COMMIT']);
});

test('bulk auto-floor creation rejects maximum plus one before acquiring a client', async () => {
  const pool = bulkPool();
  const { bulkCreate } = loadController({ pool });
  const res = response();

  await bulkCreate({
    communityId: 7,
    complexId: 70,
    body: {
      building: { name: 'Casas', building_type: 'house' },
      total_lots: 201,
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'total_lots debe ser un entero entre 1 y 200' });
  assert.equal(pool.state.connections, 0);
  assert.equal(pool.state.writes, 0);
});

test('tower bulk creation rejects more than 50 floors before acquiring a client', async () => {
  const pool = bulkPool();
  const { bulkCreate } = loadController({ pool });
  const res = response();
  const floors = Array.from({ length: 51 }, (_, index) => ({ number: index + 1, units: [] }));

  await bulkCreate({
    communityId: 7,
    complexId: 70,
    body: { building: { name: 'Torre', building_type: 'tower' }, floors },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'floors admite entre 1 y 50 elementos' });
  assert.equal(pool.state.connections, 0);
  assert.equal(pool.state.writes, 0);
});

test('tower bulk creation rejects more than 100 units in one floor before acquiring a client', async () => {
  const pool = bulkPool();
  const { bulkCreate } = loadController({ pool });
  const res = response();
  const units = Array.from({ length: 101 }, (_, index) => ({ unit_code: `U${index + 1}` }));

  await bulkCreate({
    communityId: 7,
    complexId: 70,
    body: {
      building: { name: 'Torre', building_type: 'tower' },
      floors: [{ number: 1, units }],
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'cada piso admite hasta 100 unidades' });
  assert.equal(pool.state.connections, 0);
  assert.equal(pool.state.writes, 0);
});

function reorganizePool() {
  const state = { reads: 0 };
  return {
    state,
    async query(sql) {
      state.reads += 1;
      if (/FROM units u\s+JOIN floors/.test(sql)) return { rows: [{ complex_id: 70 }] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

test('unit reorganization accepts 100 entries from the supported per-floor UI flow', async () => {
  const pool = reorganizePool();
  let mutations = 0;
  const { reorganizeUnits } = loadController({
    pool,
    hierarchyImpl: {
      async reorganizeUnits(communityId, entries) {
        mutations += 1;
        return { updated: entries, errors: [] };
      },
    },
  });
  const res = response();
  const entries = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, sort_order: index + 1 }));

  await reorganizeUnits({ communityId: 7, body: { entries } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(mutations, 1);
});

test('unit reorganization rejects 101 entries before ownership reads or mutation', async () => {
  const pool = reorganizePool();
  let mutations = 0;
  const { reorganizeUnits } = loadController({
    pool,
    hierarchyImpl: {
      async reorganizeUnits() {
        mutations += 1;
        return { updated: [], errors: [] };
      },
    },
  });
  const res = response();
  const entries = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, sort_order: index + 1 }));

  await reorganizeUnits({ communityId: 7, body: { entries } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'entries admite hasta 100 elementos' });
  assert.equal(pool.state.reads, 0);
  assert.equal(mutations, 0);
});
