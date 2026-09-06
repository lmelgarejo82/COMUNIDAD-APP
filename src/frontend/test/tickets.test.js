import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, nodes, content, deferred } from './helpers/renderPage.js';
const record = (id = 1, status = 'sent', replies = []) => ({ id, status, replies, title: `Ticket QA ${id}`, description: 'Agua', category: 'maintenance', priority: 'high', unit_number: 'QA', user_id: 10, created_at: '2026-09-05T12:00:00Z' });
const reply = { id: 80, ticket_id: 1, message: 'Respuesta guardada', is_admin: true, created_at: '2026-09-05T13:00:00Z' };
const expand = node => Array.isArray(node) ? node.map(expand) : node && typeof node === 'object' ? (typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } }) : node;
const all = h => expand(h.tree());
const button = (h, name) => nodes(all(h), n => n?.type === 'button' && content(n) === name)[0];
const detail = h => nodes(all(h), n => n?.type === 'aside')[0];
const text = h => content(all(h));
const edit = (h, value) => { nodes(all(h), n => n?.type === 'textarea')[0].props.onChange({ target: { value } }); h.render(); };
const submit = h => nodes(all(h), n => n?.type === 'form')[0].props.onSubmit({ preventDefault() {} });
async function page(service = {}) {
  const calls = [];
  const api = { listAll: async () => ({ data: { data: [record(), record(2)] } }), get: async id => ({ data: record(id, 'in_progress', id === 1 ? [reply] : []) }), addReply: async (id, message) => { calls.push([id, message]); return { data: reply }; }, updateStatus: async (id, status) => ({ data: { ...record(id, status), replies: undefined } }), ...service };
  const h = await renderPage('Tickets', { 'services/comunicacion': { ticketService: api }, 'context/AuthContext': { useAuth: () => ({ user: { id: 1, role: 'admin' } }) }, 'components/Spinner': { default: () => null } });
  await h.settle();
  return { ...h, calls, select(id = 1) { nodes(all(h), n => n?.type === 'tr' && content(n).includes(`Ticket QA ${id}`))[0].props.onClick(); h.render(); }, close() { button(h, '×').props.onClick(); h.render(); } };
}
test('select loads persisted replies and blocks actions until fresh detail arrives', async () => {
  const request = deferred(); const h = await page({ get: () => request.promise }); h.select();
  assert.equal(button(h, 'Resuelto').props.disabled, true); assert.match(text(h), /Cargando historial/);
  request.resolve({ data: record(1, 'in_progress', [reply]) }); await h.settle();
  assert.match(content(detail(h)), /Respuesta guardada/); assert.equal(button(h, 'Resuelto').props.disabled, false);
});
test('replaced and closed detail ignores obsolete success and failure', async () => {
  const a = deferred(), b = deferred(); const h = await page({ get: id => (id === 1 ? a : b).promise });
  a.promise.catch(() => {});
  h.select(1); h.select(2); b.resolve({ data: record(2, 'resolved') }); await h.settle();
  a.reject(new Error('obsolete failure')); await h.settle(); assert.match(content(detail(h)), /Ticket QA 2/); assert.doesNotMatch(text(h), /obsolete|No se pudo/);
  const c = deferred(); const closed = await page({ get: () => c.promise }); closed.select(); closed.close(); closed.unmount(); const writes = closed.writes.length;
  c.resolve({ data: record() }); await c.promise; await Promise.resolve(); assert.equal(closed.writes.length, writes);
});
test('initial failure is visible, non-actionable and retry loads the persisted thread', async () => {
  let reads = 0; const h = await page({ get: async () => { if (++reads === 1) throw new Error('offline'); return { data: record(1, 'resolved', [reply]) }; } }); h.select(); await h.settle();
  assert.equal(button(h, 'Resuelto').props.disabled, true); assert.match(content(detail(h)), /No se pudo/);
  await button(h, 'Reintentar historial').props.onClick(); h.render(); assert.match(content(detail(h)), /Respuesta guardada/); assert.equal(button(h, 'Resuelto').props.disabled, false);
});
for (const mutation of ['reply', 'status']) test(`committed ${mutation} survives failed refresh and retry without duplicate mutation`, async () => {
  let reads = 0; const h = await page({ get: async () => { if (++reads === 2) throw new Error('offline'); return { data: record(1, reads > 2 ? 'resolved' : 'sent', reads > 2 ? [reply] : []) }; } });
  h.select(); await h.settle();
  if (mutation === 'reply') { edit(h, reply.message); await submit(h); } else await button(h, 'Resuelto').props.onClick(); h.render();
  assert.match(text(h), mutation === 'reply' ? /Actualización agregada/ : /Estado actualizado/); assert.match(content(detail(h)), /guardó|guardada/); assert.equal(button(h, 'Resuelto').props.disabled, true);
  if (mutation === 'reply') { assert.match(content(detail(h)), /Respuesta guardada/); assert.equal(nodes(all(h), n => n?.type === 'textarea')[0].props.value, ''); }
  else assert.match(content(detail(h)), /Resuelto/);
  await button(h, 'Reintentar historial').props.onClick(); h.render(); assert.equal(button(h, 'Resuelto').props.disabled, false); assert.equal(h.calls.length, mutation === 'reply' ? 1 : 0);
});
test('old reply completion cannot append to another ticket or release its pending operation', async () => {
  const a = deferred(), b = deferred(); const h = await page({ addReply: id => (id === 1 ? a : b).promise });
  h.select(1); await h.settle(); edit(h, 'Primera'); const first = submit(h); h.render();
  h.select(2); await h.settle(); edit(h, 'Segunda'); const second = submit(h); h.render();
  a.resolve({ data: { ...reply, message: 'Primera' } }); await first; h.render();
  assert.doesNotMatch(content(detail(h)), /Primera/); assert.equal(button(h, 'Agregar nota').props.disabled, true); assert.equal(nodes(all(h), n => n?.type === 'textarea')[0].props.value, 'Segunda');
  b.resolve({ data: { ...reply, ticket_id: 2, message: 'Segunda' } }); await second;
});
for (const succeeds of [true, false]) test(`newer explicit read ${succeeds ? 'success' : 'failure'} owns inherited loading over deferred initial read`, async () => {
  const old = deferred(), current = deferred(); let reads = 0;
  const h = await page({ get: () => (++reads === 1 ? old : current).promise }); h.select();
  // Retrying a slow initial read uses the same freshness domain as reconciliation.
  assert.ok(button(h, 'Reintentar historial'), 'slow detail offers a fresh read');
  const retry = button(h, 'Reintentar historial').props.onClick(); h.render();
  if (succeeds) current.resolve({ data: record(1, 'resolved', [reply]) }); else current.reject(new Error('offline'));
  await retry; h.render(); assert.doesNotMatch(text(h), /Cargando historial/);
  old.resolve({ data: record(1, 'sent') }); await h.settle();
  assert.equal(button(h, 'Resuelto').props.disabled, !succeeds);
  if (succeeds) assert.match(content(detail(h)), /Respuesta guardada/); else assert.match(content(detail(h)), /No se pudo/);
});

test('newer retry releases mutation reconciliation loading even while its older read remains pending', async () => {
  const old = deferred(); let reads = 0;
  const h = await page({ get: async () => ++reads === 2 ? old.promise : { data: record(1, reads > 2 ? 'resolved' : 'sent', [reply]) } });
  h.select(); await h.settle(); const mutation = button(h, 'Resuelto').props.onClick(); await h.settle();
  await button(h, 'Reintentar historial').props.onClick(); h.render();
  assert.equal(button(h, 'Resuelto').props.disabled, false, 'current authoritative read releases inherited busy state');
  old.resolve({ data: record(1, 'sent') }); await mutation; h.render(); assert.match(content(detail(h)), /Resuelto/);
});

test('deferred initial detail cannot overwrite a subsequent retry and committed mutation readback', async () => {
  const old = deferred(); let reads = 0;
  const h = await page({ get: async () => ++reads === 1 ? old.promise : { data: record(1, reads > 2 ? 'resolved' : 'sent', reads > 2 ? [reply] : []) } });
  h.select(); await button(h, 'Reintentar historial').props.onClick(); h.render();
  await button(h, 'Resuelto').props.onClick(); h.render();
  old.resolve({ data: record(1, 'sent') }); await h.settle();
  assert.match(content(detail(h)), /Respuesta guardada/); assert.match(content(detail(h)), /Estado actual: Resuelto/); assert.equal(button(h, 'Resuelto').props.disabled, false);
});
for (const kind of ['reply', 'status']) test(`closing ${kind} operation cannot write state after unmount`, async () => {
  const request = deferred(); const h = await page({ addReply: () => request.promise, updateStatus: () => request.promise });
  h.select(); await h.settle(); edit(h, 'Pendiente');
  const mutation = kind === 'reply' ? submit(h) : button(h, 'Resuelto').props.onClick(); h.render(); h.close(); h.unmount(); const before = h.writes.length;
  request.resolve({ data: kind === 'reply' ? reply : record(1, 'resolved') }); await mutation; assert.equal(h.writes.length, before);
});
test('old failed status cannot replace another ticket feedback or clear its pending status', async () => {
  const a = deferred(), b = deferred(); const h = await page({ updateStatus: id => (id === 1 ? a : b).promise });
  h.select(1); await h.settle(); const first = button(h, 'Resuelto').props.onClick(); h.render();
  h.select(2); await h.settle(); const second = button(h, 'Cerrado').props.onClick(); h.render();
  a.reject(new Error('old status error')); await first; h.render(); assert.doesNotMatch(content(detail(h)), /old status error/); assert.equal(button(h, 'Cerrado').props.disabled, true);
  b.resolve({ data: record(2, 'closed') }); await second;
});

for (const kind of ['reply', 'status']) {
  for (const outcome of ['success', 'failure', 'readback failure']) test(`same-ticket reopen retains pending ${kind} through late ${outcome}`, async () => {
    const pending = deferred(); let reads = 0, writes = 0, committed = false;
    const h = await page({
      get: async () => {
        reads++;
        if (committed && outcome === 'readback failure' && reads === 3) throw new Error('offline');
        return { data: record(1, committed ? (kind === 'reply' ? 'in_progress' : 'resolved') : 'sent', committed && kind === 'reply' ? [reply] : []) };
      },
      addReply: () => { writes++; return pending.promise; },
      updateStatus: () => { writes++; return pending.promise; },
    });
    h.select(); await h.settle(); edit(h, reply.message);
    const first = kind === 'reply' ? submit(h) : button(h, 'Resuelto').props.onClick(); h.render();
    h.close(); h.select(); await h.settle(); edit(h, reply.message);
    assert.equal(reads, 2, 'replacement GET returned the precommit record');
    assert.equal(button(h, 'Resuelto').props.disabled, true, 'same record still owns its pending write');
    assert.equal(button(h, 'Agregar nota').props.disabled, true);
    await submit(h); await button(h, 'Resuelto').props.onClick();
    assert.equal(writes, 1, 'handlers also reject duplicate pending writes');
    if (outcome === 'failure') pending.reject(new Error('Current mutation failed'));
    else { committed = true; pending.resolve({ data: kind === 'reply' ? reply : record(1, 'resolved') }); }
    await first; await h.settle();
    if (outcome === 'failure') {
      assert.match(content(detail(h)), kind === 'reply' ? /Error al responder/ : /Error al actualizar estado/);
      assert.equal(button(h, 'Resuelto').props.disabled, false);
      assert.equal(nodes(all(h), n => n?.type === 'textarea')[0].props.value, reply.message);
    } else {
      assert.equal(reads, 3, 'old-panel commit triggers current same-record readback');
      assert.match(content(detail(h)), kind === 'reply' ? /Respuesta guardada/ : /Estado actual: Resuelto/);
      if (outcome === 'readback failure') {
        assert.match(content(detail(h)), /El cambio se guardó/);
        assert.equal(button(h, 'Resuelto').props.disabled, true);
        if (kind === 'reply') assert.ok(nodes(detail(h), n => n?.type === 'span' && content(n) === 'Abierto').length, 'reply-only response cannot infer status');
        await button(h, 'Reintentar historial').props.onClick(); h.render();
      }
      assert.equal(button(h, 'Resuelto').props.disabled, false);
      assert.match(content(detail(h)), kind === 'reply' ? /Estado actual: En proceso/ : /Estado actual: Resuelto/);
    }
    assert.equal(writes, 1);
  });
}

test('reopened same-ticket reconciliation retry owns loading over both earlier reads', async () => {
  const pending = deferred(), precommit = deferred(), readback = deferred(); let reads = 0;
  const h = await page({ get: () => {
    reads++;
    return reads === 2 ? precommit.promise : reads === 3 ? readback.promise : Promise.resolve({ data: record(1, reads >= 4 ? 'resolved' : 'sent') });
  }, updateStatus: () => pending.promise });
  h.select(); await h.settle(); const first = button(h, 'Resuelto').props.onClick(); h.render();
  h.close(); h.select(); pending.resolve({ data: record(1, 'resolved') }); await h.settle();
  assert.equal(reads, 3, 'commit launches a fresh current-panel read');
  await button(h, 'Reintentar historial').props.onClick(); h.render();
  assert.equal(reads, 4); assert.equal(button(h, 'Resuelto').props.disabled, false);
  precommit.resolve({ data: record() }); readback.resolve({ data: record() }); await first; await h.settle();
  assert.match(content(detail(h)), /Estado actual: Resuelto/); assert.doesNotMatch(text(h), /Cargando historial/);
});

test('another ticket remains independent while a closed ticket commits and later reopens', async () => {
  const pending = deferred(), otherRead = deferred(); let firstReads = 0;
  const h = await page({ get: id => id === 2 ? otherRead.promise : ++firstReads === 1 ? Promise.resolve({ data: record() }) : Promise.reject(new Error('offline')), updateStatus: () => pending.promise });
  h.select(); await h.settle(); const first = button(h, 'Resuelto').props.onClick(); h.render(); h.select(2);
  pending.resolve({ data: record(1, 'resolved') }); await first; h.render();
  assert.match(content(detail(h)), /Cargando historial/); assert.doesNotMatch(content(detail(h)), /Estado actualizado/);
  otherRead.resolve({ data: record(2) }); await h.settle(); assert.equal(button(h, 'Resuelto').props.disabled, false);
  h.select(1); await h.settle();
  assert.match(content(detail(h)), /Estado actual: Resuelto/); assert.match(content(detail(h)), /El cambio se guardó/);
  assert.equal(button(h, 'Resuelto').props.disabled, true);
});
