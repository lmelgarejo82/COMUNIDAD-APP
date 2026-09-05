import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, nodes, content, deferred } from './helpers/renderPage.js';
const row = (id = 1) => ({ id, title: `Anuncio ${id}`, message: 'Mensaje', created_at: '2026-09-05T12:00:00Z', is_new: true });
const result = (data = [row()], totalPages = 1) => ({ data: { data, totalPages } });
const button = (h, name) => nodes(h.tree(), n => n?.type === 'button' && content(n) === name)[0];
const text = h => content(h.tree());
const submit = h => nodes(h.tree(), n => n?.type === 'form')[0].props.onSubmit({ preventDefault() {} });
async function page(role = 'residente', service = {}) {
  const h = await renderPage('Anuncios', { 'services/comunicacion': { announcementService: { listAll: async () => result(), listResident: async () => result(), create: async () => ({ data: row(2) }), delete: async () => ({ data: { message: 'Anuncio eliminado' } }), markAsRead: async () => ({ data: { message: 'Marcado como leído' } }), ...service } }, 'context/AuthContext': { useAuth: () => ({ user: { id: 1, role } }) }, 'components/Spinner': { default: () => null } }, { confirm: () => true });
  await h.settle(); return h;
}
test('resident load error is visible outside admin form, never false empty, and retry recovers', async () => {
  let reads = 0; const h = await page('residente', { listResident: async () => { if (++reads === 1) throw new Error('offline'); return result([]); } });
  assert.match(text(h), /Error al cargar/); assert.doesNotMatch(text(h), /No hay anuncios/); assert.ok(button(h, 'Reintentar anuncios'));
  await button(h, 'Reintentar anuncios').props.onClick(); h.render(); assert.match(text(h), /No hay anuncios/); assert.doesNotMatch(text(h), /Error al cargar/);
});
for (const operation of ['delete', 'markAsRead']) test(`${operation} rejection is handled with row feedback and no false commit`, async () => {
  const h = await page(operation === 'delete' ? 'admin' : 'residente', { [operation]: async () => { throw new Error('offline'); } });
  let rejected = false; try { await button(h, operation === 'delete' ? 'Eliminar' : 'Marcar leído').props.onClick(); } catch { rejected = true; }
  h.render(); assert.equal(rejected, false, 'mutation errors must be handled'); assert.match(text(h), /No se pudo/); assert.match(text(h), /Anuncio 1/);
  assert.ok(button(h, operation === 'delete' ? 'Eliminar' : 'Marcar leído'));
});
test('creation owns its pending guard, preserves draft on failure and blocks duplicate submits', async () => {
  const pending = deferred(); let calls = 0; const h = await page('admin', { create: () => { calls++; return pending.promise; } });
  button(h, '+ Nuevo anuncio').props.onClick(); h.render();
  const input = nodes(h.tree(), n => n?.type === 'input')[0]; input.props.onChange({ target: { value: 'Título pendiente' } }); h.render();
  const first = submit(h); const second = submit(h); h.render();
  const observed = { calls, disabled: nodes(h.tree(), n => n?.type === 'button' && n.props.type === 'submit')[0].props.disabled };
  pending.reject(new Error('offline')); await Promise.all([first, second]); h.render();
  assert.equal(observed.calls, 1); assert.equal(observed.disabled, true); assert.equal(nodes(h.tree(), n => n?.type === 'input')[0].props.value, 'Título pendiente');
});
for (const operation of ['create', 'delete', 'markAsRead']) test(`committed ${operation} survives readback failure with separate warning and retry`, async () => {
  let reads = 0; const load = async () => { if (++reads === 2) throw new Error('offline'); return result(reads > 2 ? operation === 'delete' ? [] : operation === 'create' ? [row(2), row()] : [{ ...row(), is_new: false }] : [row()]); };
  const h = await page(operation === 'markAsRead' ? 'residente' : 'admin', { listAll: load, listResident: load });
  if (operation === 'create') { button(h, '+ Nuevo anuncio').props.onClick(); h.render(); await submit(h); }
  else await button(h, operation === 'delete' ? 'Eliminar' : 'Marcar leído').props.onClick();
  await h.settle(); assert.match(text(h), /guardó|guardados/); assert.ok(button(h, 'Reintentar anuncios'));
  if (operation === 'create') assert.match(text(h), /Anuncio 2/);
  if (operation === 'delete') assert.doesNotMatch(text(h), /Anuncio 1/);
  if (operation === 'markAsRead') assert.equal(button(h, 'Marcar leído'), undefined);
  await button(h, 'Reintentar anuncios').props.onClick(); h.render(); assert.doesNotMatch(text(h), /No se pudo actualizar/);
});
for (const operation of ['delete', 'markAsRead']) test(`deferred list cannot resurrect committed ${operation} after a newer read`, async () => {
  const stale = deferred(); let reads = 0;
  const load = async () => ++reads === 2 ? stale.promise : result(reads >= 3 ? operation === 'delete' ? [] : [{ ...row(), is_new: false }] : [row()], 2);
  const h = await page(operation === 'delete' ? 'admin' : 'residente', { listAll: load, listResident: load });
  button(h, 'Siguiente').props.onClick(); h.render();
  // Existing data stays visible during reads, with the request identity protecting later commits.
  assert.ok(button(h, operation === 'delete' ? 'Eliminar' : 'Marcar leído'), 'loaded row stays visible while refreshing');
  await button(h, operation === 'delete' ? 'Eliminar' : 'Marcar leído').props.onClick(); h.render();
  stale.resolve(result([row()], 2)); await h.settle();
  if (operation === 'delete') assert.doesNotMatch(text(h), /Anuncio 1/); else assert.equal(button(h, 'Marcar leído'), undefined);
});
test('row pending ownership rejects duplicate actions while another row remains independent', async () => {
  const a = deferred(), b = deferred(); let calls = 0; const h = await page('residente', { listResident: async () => result([row(), row(2)]), markAsRead: id => { calls++; return (id === 1 ? a : b).promise; } });
  const actions = nodes(h.tree(), n => n?.type === 'button' && content(n) === 'Marcar leído');
  const first = actions[0].props.onClick(); const duplicate = actions[0].props.onClick(); const second = actions[1].props.onClick(); h.render();
  const observed = calls; a.resolve({ data: {} }); await Promise.all([first, duplicate]); h.render();
  const secondBusy = nodes(h.tree(), n => n?.type === 'button' && n.props.disabled === true).length > 0;
  b.resolve({ data: {} }); await second; assert.equal(observed, 2); assert.equal(secondBusy, true);
});
test('deleting the last row on the last page returns to the remaining valid page', async () => {
  let deleted = false;
  const h = await page('admin', { listAll: async page => result(page === 1 ? [row()] : deleted ? [] : [row(2)], deleted ? 1 : 2), delete: async () => { deleted = true; return { data: {} }; } });
  button(h, 'Siguiente').props.onClick(); await h.settle(); await h.settle();
  assert.match(text(h), /Anuncio 2/); await button(h, 'Eliminar').props.onClick(); await h.settle(); await h.settle();
  assert.match(text(h), /Anuncio 1/); assert.doesNotMatch(text(h), /No hay anuncios/);
});
for (const operation of ['create', 'delete', 'markAsRead']) test(`unmounted ${operation} completion does not write state or launch a read`, async () => {
  const request = deferred(); let reads = 0;
  const load = async () => { reads++; return result(); };
  const h = await page(operation === 'markAsRead' ? 'residente' : 'admin', { listAll: load, listResident: load, [operation]: () => request.promise });
  let pending;
  if (operation === 'create') { button(h, '+ Nuevo anuncio').props.onClick(); h.render(); pending = submit(h); }
  else pending = button(h, operation === 'delete' ? 'Eliminar' : 'Marcar leído').props.onClick();
  h.unmount(); const writes = h.writes.length; request.resolve({ data: row(2) }); await pending;
  assert.equal(h.writes.length, writes); assert.equal(reads, 1);
});
