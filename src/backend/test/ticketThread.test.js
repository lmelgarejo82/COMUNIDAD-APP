const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const stub = (name, exports) => { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; };
const ticket = { id: 44, community_id: 7, user_id: 10, title: 'Agua', status: 'sent', deleted_at: null };
const reply = { id: 80, ticket_id: 44, message: 'Respuesta persistida', is_admin: true, created_at: '2026-09-05T12:00:00Z' };
stub('../middleware/auth', { authenticate(req, res, next) { req.user = { id: Number(req.headers['x-user'] || 10), role: req.headers['x-role'] || 'residente' }; next(); } });
stub('../middleware/setCommunity', { setCommunity(req, res, next) { req.communityId = Number(req.headers['x-community'] || 7); next(); } });
stub('../cache', { invalidatePattern: async () => {} });
let deleted = false;
const queries = [];
stub('../db', { pool: { async query(sql, values) {
  queries.push([sql, values]);
  if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
  if (sql.includes('ticket_replies')) {
    assert.match(sql, /JOIN tickets/); assert.match(sql, /t\.community_id = \$2/); assert.match(sql, /t\.deleted_at IS NULL/); assert.match(sql, /t\.user_id = \$3/);
    assert.match(sql, /ORDER BY r\.created_at ASC, r\.id ASC/);
    return { rows: values[0] === '44' && values[1] === 7 && (values[2] === null || values[2] === 10) && !deleted ? [reply] : [] };
  }
  if (sql.includes('WHERE t.id = $1')) {
    assert.match(sql, /t\.community_id = \$2/); assert.match(sql, /t\.deleted_at IS NULL/); assert.match(sql, /t\.user_id = \$3/);
    return { rows: values[0] === '44' && values[1] === 7 && (values[2] === null || values[2] === 10) && !deleted ? [ticket] : [] };
  }
  return { rows: [] };
} } });
const app = express(); app.use('/api/tickets', require('../routes/tickets'));
let server, origin;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));
for (const role of ['admin', 'residente']) test(`${role} reads authorized persistent thread`, async () => {
  const response = await fetch(`${origin}/api/tickets/44`, { headers: { 'x-role': role } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ...ticket, replies: [reply] });
});
for (const [name, id, headers, removed] of [['absent', '999', {}, false], ['foreign', '44', { 'x-community': '8' }, false], ['nonowner', '44', { 'x-user': '11' }, false], ['deleted', '44', {}, true]]) test(`${name} thread is safe 404 without replies query`, async () => {
  deleted = removed; queries.length = 0;
  try {
    const response = await fetch(`${origin}/api/tickets/${id}`, { headers });
    assert.equal(response.status, 404); assert.match(response.headers.get('content-type'), /application\/json/); assert.deepEqual(await response.json(), { error: 'Ticket no encontrado' });
    assert.equal(queries.some(([sql]) => sql.includes('ticket_replies')), false);
  } finally { deleted = false; }
});
test('guard thread is forbidden before ticket lookup', async () => {
  queries.length = 0;
  const response = await fetch(`${origin}/api/tickets/44`, { headers: { 'x-role': 'access_operator' } });
  assert.equal(response.status, 403); assert.equal(queries.length, 0);
});
test('/my still resolves the resident list, before detail route', async () => {
  const response = await fetch(`${origin}/api/tickets/my`); assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, []);
});
test('malformed and out-of-range IDs are safe 404 without database work', async () => {
  for (const id of ['invalid', '0', '-1', '1.2', '2147483648', '99999999999999999999999999']) {
    queries.length = 0;
    const response = await fetch(`${origin}/api/tickets/${id}`);
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'Ticket no encontrado' }); assert.equal(queries.length, 0);
  }
});
