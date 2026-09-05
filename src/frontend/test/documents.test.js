import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, nodes, content, deferred } from './helpers/renderPage.js';

const rows = [1, 2].map(id => ({ id, title: '../unsafe/title', file_url: `/uploads/doc-${id}.pdf`, created_at: '2026-09-05' }));
const buttons = h => nodes(h.tree(), n => n?.type === 'button');
async function page(get = async () => ({ data: rows }), download = async () => {}) {
  return renderPage('Documents', { 'services/api': { default: { get } }, 'context/AuthContext': { useAuth: () => ({ user: { role: 'residente' } }) }, 'services/protectedUploads': { downloadProtectedUpload: download }, 'components/Spinner': { default: () => null } });
}
test('documents render individual authenticated downloads using canonical paths and safe filenames', async () => {
  const calls = [];
  const h = await page(undefined, async (...args) => calls.push(args)); await h.settle();
  const downloads = buttons(h).filter(b => content(b) === 'Descargar PDF');
  assert.equal(downloads.length, 2);
  await downloads[0].props.onClick();
  assert.equal(calls[0][0], '/uploads/doc-1.pdf');
  assert.equal(calls[0][1], 'documento-1.pdf');
});
test('documents distinguish failed load from loaded empty and expose retry', async () => {
  const h = await page(async () => { throw new Error('offline'); }); await h.settle();
  assert.match(content(h.tree()), /Error al cargar/);
  assert.doesNotMatch(content(h.tree()), /No hay documentos/);
  assert.ok(buttons(h).find(b => /Reintentar/.test(content(b))));
  const empty = await page(async () => ({ data: [] })); await empty.settle();
  assert.match(content(empty.tree()), /No hay documentos/);
});
test('parallel document completions retain each row busy state and isolate errors', async () => {
  const a = deferred(), b = deferred(); let index = 0;
  const h = await page(undefined, () => [a, b][index++].promise); await h.settle();
  const first = buttons(h)[0].props.onClick(); h.render();
  const second = buttons(h)[1].props.onClick(); h.render();
  a.reject(new Error('offline')); await first; h.render();
  assert.equal(buttons(h)[1].props.disabled, true);
  assert.match(content(h.tree()), /Error al descargar/);
  b.resolve(); await second; h.render();
  assert.equal(buttons(h)[1].props.disabled, false);
});
test('document load and download completions do not write after unmount', async () => {
  const request = deferred(); const h = await page(undefined, () => request.promise); await h.settle();
  const pending = buttons(h)[0].props.onClick(); h.unmount(); const count = h.writes.length;
  request.reject(new Error('offline')); await pending;
  assert.equal(h.writes.length, count);
  const list = deferred(); const loading = await page(() => list.promise); loading.unmount(); const before = loading.writes.length;
  list.resolve({ data: rows }); await loading.settle(); assert.equal(loading.writes.length, before);
});
