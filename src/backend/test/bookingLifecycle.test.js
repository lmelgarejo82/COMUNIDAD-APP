const test = require('node:test');
const assert = require('node:assert/strict');
const paths = ['../controllers/bookingController', '../models/Booking', '../models/Notification', '../models/User', '../db'].map(require.resolve);
function setup({ current = 'pending', foreign = false, stale = false, notificationFailure = false } = {}) {
  const calls = [], notifications = [];
  let persisted = current, staged = current;
  const client = { async query(sql) { calls.push(sql); if (sql === 'COMMIT') persisted = staged; if (sql === 'ROLLBACK') staged = persisted; return { rows: [] }; }, release() { calls.push('release'); } };
  const booking = {
    async findById(id, communityId) { return foreign || communityId !== 7 ? null : { id: Number(id), amenity_id: 12, status: current, user_id: 5, amenity_name: 'SUM' }; },
    async getAmenityById(id, communityId) { calls.push('amenity'); return communityId === 7 ? { id: 12, name: 'SUM', rules: {} } : null; },
    async updateStatus(id, status, communityId, expected, tx) {
      calls.push(['update', id, status, communityId, expected, tx === client]);
      if (stale) return null;
      if (tx === client) staged = status; else persisted = status;
      return { id: Number(id), status };
    },
    async findOverlapping() { calls.push('overlap'); return false; },
    async create() { calls.push('insert'); return { id: 61 }; },
  };
  for (const path of paths) delete require.cache[path];
  const exports = [{}, { Booking: booking }, { Notification: { async create(data, tx) { if (notificationFailure) throw new Error('QA notification insert failed'); notifications.push({ data, transactional: tx === client }); } } }, { User: { async findById() { return { unit_number: 'QA' }; } } }, { pool: { ...client, async connect() { calls.push('connect'); return client; } } }];
  paths.slice(1).forEach((path, i) => { require.cache[path] = { id: path, filename: path, loaded: true, exports: exports[i + 1] }; });
  return { controller: require(paths[0]), calls, notifications, persisted: () => persisted };
}
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
async function update(fixture, status, expected = 'pending') {
  const res = response();
  await fixture.controller.updateBookingStatus({ params: { id: '61' }, body: { status, expected_status: expected }, communityId: 7 }, res);
  return res;
}
for (const [from, to, label] of [['pending', 'active', 'aprobada'], ['pending', 'cancelled', 'cancelada'], ['active', 'finished', 'finalizada'], ['active', 'cancelled', 'cancelada']]) {
  test(`${from} to ${to} commits scoped expected-state and Spanish notification together`, async () => {
    const f = setup({ current: from }); const res = await update(f, to, from);
    assert.equal(res.statusCode, 200); assert.equal(f.persisted(), to);
    assert.ok(f.calls.some(call => Array.isArray(call) && call[3] === 7 && call[4] === from && call[5]));
    assert.equal(f.notifications[0].transactional, true); assert.match(f.notifications[0].data.message, new RegExp(label));
    assert.ok(f.calls.includes('COMMIT'));
  });
}
for (const [from, to] of [['pending', 'pending'], ['pending', 'finished'], ['active', 'pending'], ['active', 'active'], ['finished', 'pending'], ['finished', 'active'], ['finished', 'finished'], ['finished', 'cancelled'], ['cancelled', 'pending'], ['cancelled', 'active'], ['cancelled', 'finished'], ['cancelled', 'cancelled']]) {
  test(`${from} to ${to} rejects without mutation or notification`, async () => {
    const f = setup({ current: from }); const res = await update(f, to, from);
    assert.equal(res.statusCode, 409); assert.equal(f.persisted(), from); assert.equal(f.notifications.length, 0);
  });
}
test('foreign booking remains 404 without notification', async () => { const f = setup({ foreign: true }); assert.equal((await update(f, 'active')).statusCode, 404); assert.equal(f.notifications.length, 0); });
test('stale atomic update is 409 without notification', async () => { const f = setup({ stale: true }); assert.equal((await update(f, 'active')).statusCode, 409); assert.equal(f.notifications.length, 0); });
test('notification insertion failure rolls back booking state', async () => {
  const f = setup({ notificationFailure: true }); const error = console.error; console.error = () => {};
  try { assert.equal((await update(f, 'active')).statusCode, 500); } finally { console.error = error; }
  assert.equal(f.persisted(), 'pending'); assert.ok(f.calls.includes('ROLLBACK'));
});
test('invalid date rejects before any SQL or booking lookup', async () => {
  for (const bad of ['not-a-date', 'Infinity', '2026-99-99']) {
    const f = setup(); const res = response();
    await f.controller.createBooking({ body: { amenity_id: 12, date_from: bad, date_to: '2099-01-01' }, user: { id: 5 }, communityId: 7 }, res);
    assert.equal(res.statusCode, 400); assert.deepEqual(f.calls, []);
  }
});
test('invalid status payload is 400 before SQL', async () => { const f = setup(); assert.equal((await update(f, 'bogus')).statusCode, 400); assert.deepEqual(f.calls, []); });
test('missing or malformed expected state is 400 before SQL', async () => {
  for (const expected of [null, '', 7, {}, 'bogus']) { const f = setup(); assert.equal((await update(f, 'active', expected)).statusCode, 400); assert.deepEqual(f.calls, []); }
  const f = setup(), res = response(); await f.controller.updateBookingStatus({ params: { id: '61' }, body: { status: 'active' }, communityId: 7 }, res); assert.equal(res.statusCode, 400); assert.deepEqual(f.calls, []);
});
