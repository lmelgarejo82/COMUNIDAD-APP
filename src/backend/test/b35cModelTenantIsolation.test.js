const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const hierarchyPath = require.resolve('../models/Hierarchy');

function mockModule(path, exports) {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}

function loadModel(relativePath, onQuery, extraMocks = []) {
  const modelPath = require.resolve(relativePath);
  delete require.cache[modelPath];
  delete require.cache[dbPath];
  for (const [path, exports] of extraMocks) {
    delete require.cache[path];
    mockModule(path, exports);
  }
  mockModule(dbPath, { pool: { query: onQuery } });
  return require(relativePath);
}

test('poll ID reads and vote mutation bind poll ID plus community', async () => {
  const calls = [];
  const { Poll } = loadModel('../models/Poll', async (sql, params) => {
    calls.push({ sql: String(sql), params });
    return { rows: [] };
  });

  await Poll.findById(41, 7);
  await Poll.hasVoted(41, 5, 7);
  await Poll.getResults(41, 7);
  await Poll.vote(41, 5, 0, 7);

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.match(call.sql, /community_id/);
    assert.equal(call.params.at(-1), 7);
  }
  assert.match(calls[3].sql, /INSERT INTO poll_votes[\s\S]*SELECT/);
});

test('booking amenity, booking reads, user list and status mutation bind community', async () => {
  const calls = [];
  const { Booking } = loadModel('../models/Booking', async (sql, params) => {
    calls.push({ sql: String(sql), params });
    return { rows: [] };
  }, [[hierarchyPath, { Hierarchy: { resolveUnitId: async () => null } }]]);

  await Booking.getAmenityById(12, 7);
  await Booking.findById(61, 7);
  await Booking.findByUser(5, 7);
  await Booking.updateStatus(61, 'cancelled', 7);
  await Booking.create({
    amenity_id: 12,
    community_id: 7,
    user_id: 5,
    unit_number: 'A-101',
    date_from: new Date(),
    date_to: new Date(Date.now() + 3600000),
  });

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.match(call.sql, /community_id/);
    assert.ok(call.params.includes(7));
  }
  assert.match(calls[3].sql, /UPDATE bookings/);
});

test('announcement ID reads and mutations bind announcement ID plus community', async () => {
  const calls = [];
  const { Announcement } = loadModel('../models/Announcement', async (sql, params) => {
    calls.push({ sql: String(sql), params });
    return { rows: [] };
  });

  await Announcement.findById(31, 7);
  await Announcement.markAsRead(31, 5, 7);
  await Announcement.softDelete(31, 7);
  await Announcement.updateFile(31, '/uploads/test.pdf', 7);

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.match(call.sql, /community_id/);
    assert.ok(call.params.includes(7));
  }
  assert.match(calls[1].sql, /INSERT INTO announcement_reads[\s\S]*SELECT/);
  assert.match(calls[2].sql, /UPDATE announcements/);
  assert.match(calls[3].sql, /UPDATE announcements/);
});

test('chat last-paid expense uses authoritative unit ID alongside community', async () => {
  const calls = [];
  const { ChatContext } = loadModel('../models/ChatContext', async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/FROM users/.test(sql)) {
      return { rows: [{ id: 5, email: 'resident@example.test', role: 'residente', unit_number: 'A-101', unit_id: 11, community_id: 7 }] };
    }
    if (/AS saldo/.test(sql)) return { rows: [{ saldo: '0', pendientes: '0' }] };
    if (/announcement_reads/.test(sql)) return { rows: [{ count: '0' }] };
    return { rows: [] };
  });

  const result = await ChatContext.build(5);
  const lastPaid = calls.find(call => /ue\.status = 'paid'/.test(call.sql));

  assert.equal(result.context.ultima_expensa_pagada, 'Ninguna');
  assert.match(lastPaid.sql, /e\.community_id\s*=\s*\$2/);
  assert.match(lastPaid.sql, /ue\.unit_id\s*=\s*\$1/);
  assert.deepEqual(lastPaid.params, [11, 7]);
});
