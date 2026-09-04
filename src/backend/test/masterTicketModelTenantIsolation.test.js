const test = require('node:test');
const assert = require('node:assert/strict');

const modelPath = require.resolve('../models/MasterTicket');
const dbPath = require.resolve('../db');
const queuePath = require.resolve('../jobs/masterTicketQueue');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function loadModel(pool) {
  delete require.cache[modelPath];
  mockModule(dbPath, { pool });
  mockModule(queuePath, { enqueueGeneration: async () => ({ disabled: true }) });
  return require('../models/MasterTicket').MasterTicket;
}

test('createMasterTicket validates related IDs before insert and rolls back foreign scope', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT 1\s+FROM units/.test(sql)) return { rows: [] };
      if (/INSERT INTO master_tickets/.test(sql)) {
        throw new Error('master insert must not run');
      }
      return { rows: [] };
    },
    release() {
      calls.push({ sql: 'RELEASE' });
    },
  };
  const MasterTicket = loadModel({ async connect() { return client; } });

  await assert.rejects(
    () => MasterTicket.createMasterTicket(
      { community_id: 7, title: 'Ataque', created_by: 5 },
      [{ unit_id: 99 }]
    ),
    error => error.code === 'MASTER_TICKET_SCOPE_INVALID'
  );

  assert.equal(calls.some(call => /INSERT INTO master_tickets/.test(call.sql)), false);
  assert.deepEqual(
    calls.filter(call => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(call.sql)).map(call => call.sql),
    ['BEGIN', 'ROLLBACK']
  );
});

test('createMasterTicket commits a same-community master and associations together', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT 1\s+FROM units/.test(sql)) return { rows: [{ '?column?': 1 }] };
      if (/INSERT INTO master_tickets/.test(sql)) return { rows: [{ id: 40, community_id: 7 }] };
      return { rows: [] };
    },
    release() {},
  };
  const MasterTicket = loadModel({ async connect() { return client; } });

  const master = await MasterTicket.createMasterTicket(
    { community_id: 7, title: 'Ascensor', created_by: 5 },
    [{ unit_id: 1 }]
  );

  assert.equal(master.id, 40);
  const validation = calls.find(call => /SELECT 1\s+FROM units/.test(call.sql));
  assert.deepEqual(validation.params, [1, 7]);
  assert.deepEqual(
    calls.filter(call => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(call.sql)).map(call => call.sql),
    ['BEGIN', 'COMMIT']
  );
});

test('getMasterTicket binds ID and community in the authoritative query', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM master_tickets mt/.test(sql)) {
        return { rows: [{ id: 41, community_id: 7 }] };
      }
      return { rows: [] };
    },
  };
  const MasterTicket = loadModel(pool);

  const result = await MasterTicket.getMasterTicket(41, 7);

  assert.equal(result.community_id, 7);
  assert.match(calls[0].sql, /mt\.id = \$1 AND mt\.community_id = \$2/);
  assert.deepEqual(calls[0].params, [41, 7]);
  assert.equal(calls.slice(1).every(call => call.params[1] === 7), true);
  assert.match(calls[1].sql, /scoped_complex\.community_id = \$2/);
  assert.match(calls[2].sql, /t\.community_id = \$2/);
});

test('updateMasterTicket repeats community scope in the mutation', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 41, community_id: 7, title: 'Seguro' }] };
    },
  };
  const MasterTicket = loadModel(pool);

  await MasterTicket.updateMasterTicket(41, 7, { title: 'Seguro' });

  assert.match(calls[0].sql, /WHERE id = \$1 AND community_id = \$2/);
  assert.deepEqual(calls[0].params, [41, 7, 'Seguro']);
});

test('resolveSubTicket scopes child and parent and commits atomically', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT id FROM master_tickets/.test(sql)) return { rows: [{ id: 61 }] };
      if (/UPDATE tickets/.test(sql)) {
        return { rows: [{ id: 610, master_ticket_id: 61, community_id: 7 }] };
      }
      if (/SELECT COUNT/.test(sql)) return { rows: [{ remaining: '0' }] };
      if (/UPDATE master_tickets/.test(sql)) return { rows: [{ id: 61 }] };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: 'RELEASE' });
    },
  };
  const MasterTicket = loadModel({ async connect() { return client; } });

  const result = await MasterTicket.resolveSubTicket(61, 610, 7);

  assert.equal(result.master_closed, true);
  const ticketUpdate = calls.find(call => /UPDATE tickets/.test(call.sql));
  assert.match(ticketUpdate.sql, /master_ticket_id = \$2/);
  assert.match(ticketUpdate.sql, /community_id = \$3/);
  assert.deepEqual(ticketUpdate.params, [610, 61, 7]);
  const masterUpdate = calls.find(call => /UPDATE master_tickets/.test(call.sql));
  assert.match(masterUpdate.sql, /id = \$1 AND community_id = \$2/);
  assert.deepEqual(
    calls.filter(call => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(call.sql)).map(call => call.sql),
    ['BEGIN', 'COMMIT']
  );
});

test('resolveSubTicket rolls back when closing the master fails', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (/SELECT id FROM master_tickets/.test(sql)) return { rows: [{ id: 61 }] };
      if (/UPDATE tickets/.test(sql)) {
        return { rows: [{ id: 610, master_ticket_id: 61, community_id: 7 }] };
      }
      if (/SELECT COUNT/.test(sql)) return { rows: [{ remaining: '0' }] };
      if (/UPDATE master_tickets/.test(sql)) throw new Error('close failed');
      return { rows: [] };
    },
    release() {},
  };
  const MasterTicket = loadModel({ async connect() { return client; } });

  await assert.rejects(() => MasterTicket.resolveSubTicket(61, 610, 7), /close failed/);

  assert.deepEqual(
    calls.filter(sql => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)),
    ['BEGIN', 'ROLLBACK']
  );
});
