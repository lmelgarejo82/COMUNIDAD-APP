const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/hierarchyController');
const hierarchyPath = require.resolve('../models/Hierarchy');
const adminComplexPath = require.resolve('../models/AdminComplex');
const dbPath = require.resolve('../db');
const cachePath = require.resolve('../cache');

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

function loadController({ hierarchyImpl = {}, pool }) {
  delete require.cache[controllerPath];
  mockModule(hierarchyPath, {
    Hierarchy: {
      async getComplexes(communityId) {
        return [{ id: communityId === 7 ? 70 : 80, community_id: communityId }];
      },
      ...hierarchyImpl,
    },
  });
  mockModule(adminComplexPath, { AdminComplex: {} });
  mockModule(dbPath, { pool });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  return require('../controllers/hierarchyController');
}

function hierarchyLookupPool({ unitCommunities = {}, floorCommunities = {} }) {
  return {
    async query(sql, params) {
      if (/FROM units u\s+JOIN floors/.test(sql)) {
        const communityId = unitCommunities[Number(params[0])];
        return { rows: communityId ? [{ complex_id: communityId === 7 ? 70 : 80 }] : [] };
      }
      if (/SELECT f\.id FROM floors/.test(sql)) {
        return { rows: floorCommunities[Number(params[0])] === params[1] ? [{ id: params[0] }] : [] };
      }
      throw new Error(`unexpected db query: ${sql}`);
    },
  };
}

test('bulk reorganization allows units and floors from req.communityId', async () => {
  const calls = [];
  const pool = hierarchyLookupPool({ unitCommunities: { 1: 7 }, floorCommunities: { 10: 7 } });
  const { reorganizeUnits } = loadController({
    pool,
    hierarchyImpl: {
      async reorganizeUnits(communityId, entries) {
        calls.push([communityId, entries]);
        return { updated: [{ id: 1, floor_id: 10 }], errors: [] };
      },
    },
  });
  const entries = [{ unit_id: 1, new_floor_id: 10 }];
  const res = createResponse();

  await reorganizeUnits({ communityId: 7, body: { entries } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [[7, entries]]);
});

test('bulk reorganization preserves the frontend reorder payload for same-community units', async () => {
  const calls = [];
  const pool = hierarchyLookupPool({ unitCommunities: { 1: 7 } });
  const { reorganizeUnits } = loadController({
    pool,
    hierarchyImpl: {
      async reorganizeUnits(communityId, entries) {
        calls.push([communityId, entries]);
        return { updated: [{ id: 1, sort_order: 2 }], errors: [] };
      },
    },
  });
  const entries = [{ id: 1, sort_order: 2 }];
  const res = createResponse();

  await reorganizeUnits({ communityId: 7, body: { entries } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [[7, entries]]);
});

test('bulk reorganization rejects the frontend reorder payload for a foreign unit', async () => {
  let reorganized = false;
  const pool = hierarchyLookupPool({ unitCommunities: { 99: 8 } });
  const { reorganizeUnits } = loadController({
    pool,
    hierarchyImpl: {
      async reorganizeUnits() {
        reorganized = true;
      },
    },
  });
  const res = createResponse();

  await reorganizeUnits({ communityId: 7, body: { entries: [{ id: 99, sort_order: 1 }] } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(reorganized, false);
});

test('bulk reorganization rejects a valid source unit from another community', async () => {
  let reorganized = false;
  const pool = hierarchyLookupPool({ unitCommunities: { 99: 8 }, floorCommunities: { 10: 7 } });
  const { reorganizeUnits } = loadController({
    pool,
    hierarchyImpl: {
      async reorganizeUnits() {
        reorganized = true;
        return { updated: [{ id: 99 }], errors: [] };
      },
    },
  });
  const res = createResponse();

  await reorganizeUnits(
    { communityId: 7, body: { entries: [{ unit_id: 99, new_floor_id: 10 }] } },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(reorganized, false);
});

test('mixed-community reorganization validates every entry before any mutation', async () => {
  let reorganized = false;
  const pool = hierarchyLookupPool({
    unitCommunities: { 1: 7, 99: 8 },
    floorCommunities: { 10: 7 },
  });
  const { reorganizeUnits } = loadController({
    pool,
    hierarchyImpl: {
      async reorganizeUnits() {
        reorganized = true;
        return { updated: [], errors: [] };
      },
    },
  });
  const res = createResponse();

  await reorganizeUnits({
    communityId: 7,
    body: {
      entries: [
        { unit_id: 1, new_floor_id: 10 },
        { unit_id: 99, new_floor_id: 10 },
      ],
    },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(reorganized, false);
});

function assignmentPool({ accessRows, assignmentRows = [{ id: 501, unit_id: 1, user_id: 5 }], failUserUpdate = false }) {
  const commands = [];
  const client = {
    async query(sql, params) {
      commands.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (/SELECT u\.id AS unit_id/.test(sql)) return { rows: accessRows };
      if (/INSERT INTO unit_ownerships/.test(sql)) return { rows: assignmentRows };
      if (/UPDATE users\s+SET unit_id/.test(sql)) {
        if (failUserUpdate) throw new Error('user update failed');
        return { rows: [{ id: 5 }] };
      }
      throw new Error(`unexpected client query: ${sql}`);
    },
    release() {
      commands.push({ sql: 'RELEASE' });
    },
  };
  return {
    commands,
    client,
    async connect() {
      return client;
    },
    async query(sql, params) {
      commands.push({ sql, params });
      if (/FROM units u\s+JOIN floors/.test(sql)) return { rows: [{ complex_id: 70 }] };
      if (/INSERT INTO unit_ownerships/.test(sql)) return { rows: assignmentRows };
      if (/UPDATE users\s+SET unit_id/.test(sql)) return { rows: [] };
      throw new Error(`unexpected pool query: ${sql}`);
    },
  };
}

test('assignment allows a user and unit from req.communityId and commits both writes', async () => {
  const pool = assignmentPool({ accessRows: [{ unit_id: 1, user_id: 5 }] });
  const { assignUnit } = loadController({ pool });
  const res = createResponse();

  await assignUnit({
    communityId: 7,
    body: { unit_id: 1, user_id: 5, ownership_type: 'owner', start_date: '2026-09-04' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { id: 501, unit_id: 1, user_id: 5 });
  assert.deepEqual(
    pool.commands.filter(command => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(command.sql)).map(command => command.sql),
    ['BEGIN', 'COMMIT']
  );
  const userUpdate = pool.commands.find(command => /UPDATE users\s+SET unit_id/.test(command.sql));
  assert.match(userUpdate.sql, /community_id = \$3/);
  assert.deepEqual(userUpdate.params, [1, 5, 7]);
});

test('assignment rejects a valid user from another community before writing', async () => {
  const pool = assignmentPool({ accessRows: [] });
  const { assignUnit } = loadController({ pool });
  const res = createResponse();

  await assignUnit({ communityId: 7, body: { unit_id: 1, user_id: 55 } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(pool.commands.some(command => /INSERT INTO unit_ownerships/.test(command.sql)), false);
  assert.equal(pool.commands.some(command => /UPDATE users\s+SET unit_id/.test(command.sql)), false);
  assert.equal(pool.commands.some(command => command.sql === 'ROLLBACK'), true);
});

test('assignment rolls back the ownership when the user synchronization fails', async () => {
  const pool = assignmentPool({
    accessRows: [{ unit_id: 1, user_id: 5 }],
    failUserUpdate: true,
  });
  const { assignUnit } = loadController({ pool });
  const res = createResponse();
  const originalError = console.error;
  console.error = () => {};

  try {
    await assignUnit({ communityId: 7, body: { unit_id: 1, user_id: 5 } }, res);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(
    pool.commands.filter(command => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(command.sql)).map(command => command.sql),
    ['BEGIN', 'ROLLBACK']
  );
});

test('ending an assignment scopes the update through the unit community', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 501, unit_id: 1, user_id: 5, is_primary: false }] };
    },
  };
  const { endAssignment } = loadController({ pool });
  const res = createResponse();

  await endAssignment({ params: { id: '501' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls[0].sql, /cx\.community_id = \$2/);
  assert.deepEqual(calls[0].params, [501, 7]);
});

test('ending a valid assignment from another community returns the existing safe 404', async () => {
  const pool = {
    async query(sql, params) {
      const scoped = /cx\.community_id = \$2/.test(sql) && params[1] === 7;
      return { rows: scoped ? [] : [{ id: 777, unit_id: 99, user_id: 55 }] };
    },
  };
  const { endAssignment } = loadController({ pool });
  const res = createResponse();

  await endAssignment({ params: { id: '777' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Asignación no encontrada o ya finalizada' });
});
