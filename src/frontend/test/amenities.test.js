import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, nodes, content, deferred } from './helpers/renderPage.js';
const record = (id = 1, status = 'pending') => ({ id, status, amenity_id: 1, amenity_name: `SUM ${id}`, unit_number: 'QA', date_from: '2026-09-09T15:00:00Z', date_to: '2026-09-09T16:00:00Z' });
const buttons = h => nodes(h.tree(), n => n?.type === 'button');
const button = (h, name) => buttons(h).find(n => content(n) === name);
const calendar = h => nodes(h.tree(), n => n?.type === 'calendar')[0];
async function page({ role = 'admin', rows = [record(), record(2)], service = {} } = {}) {
  const calls = [];
  const api = { getAmenities: async () => ({ data: [] }), listBookings: async () => ({ data: { data: rows } }), listMy: async () => ({ data: rows }), updateStatus: async (id, status, expected) => { calls.push([id, status, expected]); return { data: record(id, status) }; }, ...service };
  const h = await renderPage('Amenities', { 'react-big-calendar': { Calendar: 'calendar', momentLocalizer: () => ({}) }, 'services/bookings': { bookingService: api }, 'context/AuthContext': { useAuth: () => ({ user: { role } }) }, 'components/Spinner': { default: () => null } });
  await h.settle();
  return { ...h, calls, select(id = 1) { calendar(h).props.onSelectEvent(calendar(h).props.events.find(e => e.id === id)); h.render(); } };
}
for (const [status, allowed, forbidden] of [['pending', ['Aprobar', 'Cancelar reserva'], ['Finalizar']], ['active', ['Finalizar', 'Cancelar reserva'], ['Aprobar']], ['finished', [], ['Aprobar', 'Finalizar', 'Cancelar reserva']], ['cancelled', [], ['Aprobar', 'Finalizar', 'Cancelar reserva']]]) {
  test(`selected ${status} shows status and explicit allowed actions without implicit mutation`, async () => {
    const h = await page({ rows: [record(1, status)] }); h.select();
    assert.ok(nodes(h.tree(), n => n?.props?.role === 'dialog').length);
    assert.equal(h.calls.length, 0);
    for (const name of allowed) assert.ok(button(h, name), name);
    for (const name of forbidden) assert.equal(button(h, name), undefined, name);
  });
}
test('resident can inspect status but has no admin action', async () => {
  const h = await page({ role: 'residente' }); h.select();
  assert.equal(nodes(h.tree(), n => n?.props?.role === 'dialog').length, 1);
  assert.match(content(h.tree()), /Pendiente/); assert.equal(button(h, 'Aprobar'), undefined); assert.equal(button(h, 'Cancelar reserva'), undefined);
});
test('booking detail renders afternoon end time unambiguously in 24-hour format', async () => {
  const row = { ...record(), date_from: new Date(2026, 8, 9, 12).toISOString(), date_to: new Date(2026, 8, 9, 13).toISOString() };
  const h = await page({ rows: [row] }); h.select();
  const dialog = nodes(h.tree(), n => n?.props?.role === 'dialog')[0];
  assert.match(content(dialog), /13:00:00/);
  assert.doesNotMatch(content(dialog), /01:00:00/);
});
test('new booking form renders afternoon selection unambiguously in 24-hour format', async () => {
  const h = await page({ role: 'residente' });
  calendar(h).props.onSelectSlot({ start: new Date(2026, 8, 9, 12), end: new Date(2026, 8, 9, 13) }); h.render();
  assert.match(content(h.tree()), /13:00:00/);
  assert.doesNotMatch(content(h.tree()), /01:00:00/);
});
test('retry readback owns its row immediately and ignores same-render duplicate retries', async () => {
  const pending = deferred(); let reads = 0;
  const h = await page({ service: { listBookings: async () => {
    reads += 1;
    if (reads === 2) throw new Error('refresh failed');
    if (reads > 2) return pending.promise;
    return { data: { data: [record()] } };
  } } });
  h.select(); await button(h, 'Aprobar').props.onClick(); h.render();
  const retry = button(h, 'Reintentar actualización');
  const first = retry.props.onClick(); const duplicate = retry.props.onClick(); h.render();
  assert.equal(reads, 3, 'only one pending readback request may own the row');
  assert.equal(button(h, 'Reintentar actualización').props.disabled, true);
  pending.resolve({ data: { data: [record(1, 'active')] } }); await Promise.all([first, duplicate]); h.render();
  assert.equal(button(h, 'Finalizar').props.disabled, false);
});
test('committed status survives failed refresh, disables further actions and can retry readback', async () => {
  let reads = 0;
  const h = await page({ service: { listBookings: async () => { if (++reads === 2) throw new Error('offline'); return { data: { data: [record(1, reads > 2 ? 'active' : 'pending')] } }; } } });
  h.select(); await button(h, 'Aprobar').props.onClick(); h.render();
  assert.match(content(h.tree()), /Aprobada/); assert.doesNotMatch(content(h.tree()), /Error al actualizar reserva/);
  assert.equal(button(h, 'Aprobar'), undefined); assert.equal(button(h, 'Finalizar').props.disabled, true);
  assert.ok(button(h, 'Reintentar actualización'));
  await button(h, 'Reintentar actualización').props.onClick(); h.render(); assert.equal(button(h, 'Finalizar').props.disabled, false);
  assert.deepEqual(h.calls, [[1, 'active', 'pending']]);
});
test('out-of-order completions cannot replace selection or clear another booking busy state', async () => {
  const a = deferred(), b = deferred();
  const h = await page({ service: { updateStatus: id => (id === 1 ? a : b).promise } });
  h.select(1); const first = button(h, 'Aprobar').props.onClick(); h.render();
  h.select(2); const second = button(h, 'Aprobar').props.onClick(); h.render();
  a.reject(new Error('old failure')); await first; h.render();
  const dialog = nodes(h.tree(), n => n?.props?.role === 'dialog')[0];
  assert.match(content(dialog), /SUM 2/); assert.doesNotMatch(content(dialog), /Error al actualizar/);
  assert.ok(buttons(h).some(n => content(n) === 'Aprobando...' && n.props.disabled));
  b.resolve({ data: record(2, 'active') }); await second;
});
test('closed and unmounted booking requests cannot reopen detail or write state', async () => {
  const request = deferred(); const h = await page({ service: { updateStatus: () => request.promise } });
  h.select(); const pending = button(h, 'Aprobar').props.onClick(); h.render(); button(h, 'Cerrar').props.onClick(); h.render(); h.unmount(); const before = h.writes.length;
  request.resolve({ data: record(1, 'active') }); await pending;
  assert.equal(h.writes.length, before);
});
