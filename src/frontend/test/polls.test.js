import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, nodes, content, deferred } from './helpers/renderPage.js';
const poll = (voted = false) => ({ id: 8, title: 'Iluminación del hall', description: 'Prioridad del mes', options: ['Reparar', 'Esperar'], expires_at: null, has_voted: voted, results: voted ? [{ option_index: 0, count: '1' }] : [] });
const button = (h, label) => nodes(h.tree(), n => n?.type === 'button' && content(n) === label)[0];
async function widget(api = {}, user = { role: 'residente', user_type: 'owner', id: 1 }) {
  const h = await renderPage('../components/PollsWidget', {
    'services/api': { default: { get: async () => ({ data: [poll()] }), post: async () => ({ data: { id: 1 } }), ...api } },
    'context/AuthContext': { useAuth: () => ({ user }) },
  });
  await h.settle(); return h;
}
test('a previously recorded vote retains its card and read-only totals on mount', async () => {
  const h = await widget({ get: async () => ({ data: [poll(true)] }) });
  assert.match(content(h.tree()), /Iluminación del hall/);
  assert.match(content(h.tree()), /Voto registrado/);
  assert.match(content(h.tree()), /100%/);
  assert.equal(button(h, 'Reparar'), undefined);
});
test('committed vote survives a failed refresh and retry cannot offer a second vote', async () => {
  let reads = 0;
  const h = await widget({ get: async () => { if (++reads === 2) throw new Error('offline'); return { data: [poll(reads > 2)] }; } });
  await button(h, 'Reparar').props.onClick(); await h.settle();
  assert.match(content(h.tree()), /Voto registrado/);
  assert.match(content(h.tree()), /No pudimos actualizar/);
  assert.equal(button(h, 'Reparar'), undefined);
  await button(h, 'Reintentar votaciones').props.onClick(); await h.settle();
  assert.match(content(h.tree()), /100%/); assert.doesNotMatch(content(h.tree()), /No pudimos actualizar/);
});
test('pending vote disables both choices and owns synchronous duplicate submissions', async () => {
  const request = deferred(); let posts = 0;
  const h = await widget({ post: () => { posts++; return request.promise; } });
  const action = button(h, 'Reparar'); const first = action.props.onClick(); const duplicate = action.props.onClick(); h.render();
  assert.equal(posts, 1); assert.equal(button(h, 'Reparar').props.disabled, true); assert.equal(button(h, 'Esperar').props.disabled, true);
  request.reject(new Error('offline')); await Promise.all([first, duplicate]); await h.settle();
  assert.equal(button(h, 'Reparar').props.disabled, false); assert.match(content(h.tree()), /Error al votar/);
});
test('owner initial read error is visible and retry recovers an empty list', async () => {
  let reads = 0; const h = await widget({ get: async () => { if (++reads === 1) throw new Error('offline'); return { data: [] }; } });
  assert.match(content(h.tree()), /No pudimos cargar/); assert.ok(button(h, 'Reintentar votaciones'));
  await button(h, 'Reintentar votaciones').props.onClick(); await h.settle(); assert.equal(h.tree(), null);
});
test('stale reads cannot replace a newer list after retry', async () => {
  const first = deferred(), second = deferred(); let reads = 0;
  const h = await widget({ get: () => { if (++reads === 1) return Promise.reject(new Error('offline')); return reads === 2 ? first.promise : second.promise; } });
  const retry = button(h, 'Reintentar votaciones').props.onClick;
  const a = retry(), b = retry(); second.resolve({ data: [poll(true)] }); await b; await h.settle(); first.resolve({ data: [poll()] }); await a; await h.settle();
  assert.match(content(h.tree()), /Voto registrado/); assert.equal(button(h, 'Reparar'), undefined);
});
test('unmounted vote completion cannot update state or start a readback', async () => {
  const pending = deferred(); let reads = 0;
  const h = await widget({ get: async () => { reads++; return { data: [poll()] }; }, post: () => pending.promise });
  const vote = button(h, 'Reparar').props.onClick(); h.unmount(); const writes = h.writes.length; pending.resolve({ data: { id: 1 } }); await vote;
  assert.equal(h.writes.length, writes); assert.equal(reads, 1);
});
test('tenant and admin never load or render the owner voting widget', async () => {
  for (const user of [{ role: 'residente', user_type: 'tenant' }, { role: 'admin', user_type: 'owner' }]) {
    let reads = 0; const h = await widget({ get: async () => { reads++; return { data: [poll()] }; } }, user);
    assert.equal(h.tree(), null); assert.equal(reads, 0);
  }
});
