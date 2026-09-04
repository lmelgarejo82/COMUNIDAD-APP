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
  const accessCheck = pool.commands.find(command => /SELECT u\.id AS unit_id/.test(command.sql));
  assert.match(accessCheck.sql, /COALESCE\(u\.is_active, TRUE\) = TRUE/);
  assert.match(accessCheck.sql, /u\.deleted_at IS NULL/);
  assert.match(userUpdate.sql, /community_id = \$3/);
  assert.match(userUpdate.sql, /user_type = \$4/);
  assert.deepEqual(userUpdate.params, [1, 5, 7, 'owner']);
});

test('assignment rejects a valid user from another community before writing', async () => {
  const pool = assignmentPool({ accessRows: [] });
  const { assignUnit } = loadController({ pool });
  const res = createResponse();

  await assignUnit({ communityId: 7, body: { unit_id: 1, user_id: 55, ownership_type: 'owner' } }, res);

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
    await assignUnit({ communityId: 7, body: { unit_id: 1, user_id: 5, ownership_type: 'owner' } }, res);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(
    pool.commands.filter(command => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(command.sql)).map(command => command.sql),
    ['BEGIN', 'ROLLBACK']
  );
});

test('assignment requires explicit ownership type before opening a transaction', async () => {
  const pool = assignmentPool({ accessRows: [{ unit_id: 1, user_id: 5 }] });
  const { assignUnit } = loadController({ pool });
  const res = createResponse();

  await assignUnit({ communityId: 7, body: { unit_id: 1, user_id: 5 } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(pool.commands.length, 0);
});

function endAssignmentPool(rows, remainingRows = []) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql: String(sql).trim(), params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(String(sql).trim())) return { rows: [] };
      if (/UPDATE unit_ownerships/.test(sql)) return { rows };
      if (/SELECT un\.id AS unit_id/.test(sql)) return { rows: remainingRows };
      if (/UPDATE users\s+SET unit_id = \$1/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    },
    release() { calls.push({ sql: 'RELEASE' }); },
  };
  return { calls, async connect() { return client; } };
}

test('ending an assignment scopes the update and clears the compatibility mirror atomically', async () => {
  const pool = endAssignmentPool([{ id: 501, unit_id: 1, user_id: 5, is_primary: false }]);
  const { endAssignment } = loadController({ pool });
  const res = createResponse();

  await endAssignment({ params: { id: '501' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  const ownershipUpdate = pool.calls.find(call => /UPDATE unit_ownerships/.test(call.sql));
  const userUpdate = pool.calls.find(call => /UPDATE users\s+SET unit_id = \$1/.test(call.sql));
  assert.match(ownershipUpdate.sql, /cx\.community_id = \$2/);
  assert.deepEqual(ownershipUpdate.params, [501, 7]);
  assert.deepEqual(userUpdate.params, [null, null, null, 5, 1, 7]);
  assert.deepEqual(pool.calls.filter(call => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(call.sql)).map(call => call.sql), ['BEGIN', 'COMMIT']);
});

test('ending a valid assignment from another community returns the existing safe 404', async () => {
  const pool = endAssignmentPool([]);
  const { endAssignment } = loadController({ pool });
  const res = createResponse();

  await endAssignment({ params: { id: '777' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Asignación no encontrada o ya finalizada' });
  assert.deepEqual(pool.calls.filter(call => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(call.sql)).map(call => call.sql), ['BEGIN', 'ROLLBACK']);
});

test('ending the mirrored assignment promotes the existing active ownership', async () => {
  const pool = endAssignmentPool(
    [{ id: 501, unit_id: 1, user_id: 5, is_primary: false }],
    [{ unit_id: 2, unit_code: 'B-202', ownership_type: 'tenant' }]
  );
  const { endAssignment } = loadController({ pool });
  const res = createResponse();

  await endAssignment({ params: { id: '501' }, communityId: 7 }, res);

  const userUpdate = pool.calls.find(call => /UPDATE users\s+SET unit_id = \$1/.test(call.sql));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(userUpdate.params, [2, 'B-202', 'tenant', 5, 1, 7]);
  const remainingLookup = pool.calls.find(call => /SELECT un\.id AS unit_id/.test(call.sql));
  assert.match(remainingLookup.sql, /uo\.start_date IS NULL OR uo\.start_date <= NOW\(\)/);
  assert.match(remainingLookup.sql, /ORDER BY uo\.is_primary DESC, uo\.start_date DESC NULLS LAST, uo\.id DESC/);
});
