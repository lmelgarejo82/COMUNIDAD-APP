import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let expenseModule = {};
let paymentHelpers = {};
let uploadHelpers = {};
try {
  expenseModule = await import('../src/services/expensas.js');
} catch {}
try {
  paymentHelpers = await import('../src/utils/manualPayment.js');
} catch {}
try {
  uploadHelpers = await import('../src/services/protectedUploads.js');
} catch {}

const FIVE_MIB = 5 * 1024 * 1024;

test('expense service sends the proof as the sole multipart proof field and exposes rejection', async () => {
  assert.equal(typeof expenseModule.createExpenseService, 'function', 'expense service must support injected HTTP clients');
  const calls = [];
  const client = {
    put: async (...args) => {
      calls.push(args);
      return { data: {} };
    },
  };
  const service = expenseModule.createExpenseService(client);
  const proof = new File(['QA'], 'proof.pdf', { type: 'application/pdf' });

  await service.submitPayment(41, proof);
  await service.rejectPayment(41);

  assert.equal(calls[0][0], '/expenses/unit/41/pay');
  assert.equal(calls[0][1] instanceof FormData, true);
  assert.equal(calls[0][1].get('proof').name, 'proof.pdf');
  assert.deepEqual([...calls[0][1].keys()], ['proof']);
  assert.equal(calls[0].length, 2, 'Axios must create the multipart boundary');
  assert.deepEqual(calls[1], ['/expenses/unit/41/reject']);
});

test('payment proof validation requires one supported file up to and including 5 MiB', () => {
  assert.equal(typeof paymentHelpers.validatePaymentProof, 'function');
  const validate = paymentHelpers.validatePaymentProof;

  assert.equal(validate(null), 'Seleccioná un comprobante.');
  assert.equal(validate({ name: 'proof.pdf', type: 'application/pdf', size: FIVE_MIB }), null);
  assert.equal(validate({ name: 'proof.JPG', type: 'image/jpeg', size: 12 }), null);
  assert.equal(validate({ name: 'proof.jpeg', type: '', size: 12 }), null);
  assert.equal(validate({ name: 'proof.png', type: 'image/png', size: 12 }), null);
  assert.equal(validate({ name: 'proof.exe', type: 'application/pdf', size: 12 }), 'El comprobante debe ser PDF, JPG, JPEG o PNG.');
  assert.equal(validate({ name: 'proof.pdf', type: 'text/plain', size: 12 }), 'El comprobante debe ser PDF, JPG, JPEG o PNG.');
  assert.equal(validate({ name: 'proof.pdf', type: 'application/pdf', size: FIVE_MIB + 1 }), 'El comprobante no puede superar 5 MiB.');
});

test('manual payment actions follow role, status and explicit proof presence', () => {
  assert.equal(typeof paymentHelpers.manualPaymentActions, 'function');
  const actions = paymentHelpers.manualPaymentActions;

  assert.deepEqual(actions('pending', 'residente', false), ['submit']);
  assert.deepEqual(actions('rejected', 'residente', true), ['submit']);
  assert.deepEqual(actions('in_review', 'residente', true), []);
  assert.deepEqual(actions('in_review', 'admin', true), ['approve', 'reject']);
  assert.deepEqual(actions('in_review', 'admin', false), ['reject']);
  assert.deepEqual(actions('in_review', 'admin'), ['reject'], 'proof presence must never default to true');
  assert.deepEqual(actions('paid', 'admin', true), []);
  assert.deepEqual(actions('in_review', 'access_operator', true), []);
});

test('manual payment status presentation distinguishes review, paid and rejected states', () => {
  assert.equal(typeof paymentHelpers.manualPaymentStatus, 'function');
  const status = paymentHelpers.manualPaymentStatus;

  assert.equal(status('pending').label, 'Pendiente');
  assert.equal(status('in_review').label, 'En revisión');
  assert.equal(status('paid').label, 'Pagado');
  assert.equal(status('rejected').label, 'Rechazado');
  assert.equal(status('unexpected').label, 'Estado no disponible');
});

test('protected upload download accepts generated timestamp and UUID names with authenticated root requests', async () => {
  assert.equal(typeof uploadHelpers.downloadProtectedUpload, 'function');
  const calls = [];
  const clicks = [];
  const removals = [];
  const revocations = [];
  const blob = new Blob(['proof bytes'], { type: 'application/pdf' });
  const link = {
    href: '',
    download: '',
    click() { clicks.push([this.href, this.download]); },
    remove() { removals.push(true); },
  };
  const browser = {
    URL: {
      createObjectURL(value) {
        assert.equal(value, blob);
        return 'blob:qa-proof';
      },
      revokeObjectURL(value) { revocations.push(value); },
    },
    document: { createElement: tag => (assert.equal(tag, 'a'), link) },
    setTimeout(callback, delay) {
      assert.equal(delay, 0);
      callback();
    },
  };
  const client = {
    get: async (...args) => {
      calls.push(args);
      return { data: blob };
    },
  };

  await uploadHelpers.downloadProtectedUpload(
    '/uploads/proof-1725555555555-123456789.pdf',
    'comprobante-unidad-4.pdf',
    { client, browser }
  );
  await uploadHelpers.downloadProtectedUpload(
    '/uploads/550e8400-e29b-41d4-a716-446655440000.jpg',
    'comprobante-unidad-4.jpg',
    { client, browser }
  );

  assert.deepEqual(calls, [
    ['/uploads/proof-1725555555555-123456789.pdf', { baseURL: '', responseType: 'blob' }],
    ['/uploads/550e8400-e29b-41d4-a716-446655440000.jpg', { baseURL: '', responseType: 'blob' }],
  ]);
  assert.deepEqual(clicks, [
    ['blob:qa-proof', 'comprobante-unidad-4.pdf'],
    ['blob:qa-proof', 'comprobante-unidad-4.jpg'],
  ]);
  assert.equal(removals.length, 2);
  assert.deepEqual(revocations, ['blob:qa-proof', 'blob:qa-proof']);
});

test('protected upload guard rejects origins, credentials, query, fragment and traversal before HTTP', async () => {
  assert.equal(typeof uploadHelpers.downloadProtectedUpload, 'function');
  let requests = 0;
  const client = { get: async () => { requests += 1; } };
  const browser = {
    URL: { createObjectURL: () => assert.fail('must not create an object URL') },
    document: { createElement: () => assert.fail('must not create a link') },
    setTimeout,
  };
  const invalid = [
    'https://evil.example/uploads/proof.pdf',
    '//evil.example/uploads/proof.pdf',
    '/api/uploads/proof.pdf',
    '/uploads/proof.pdf?token=secret',
    '/uploads/proof.pdf#secret',
    '/uploads/../secret.pdf',
    '/uploads/%2e%2e%2fsecret.pdf',
    '/uploads/folder%2fproof.pdf',
    '/uploads/folder/proof.pdf',
    '/uploads/proof..pdf',
  ];

  for (const fileUrl of invalid) {
    await assert.rejects(
      uploadHelpers.downloadProtectedUpload(fileUrl, 'proof.pdf', { client, browser }),
      /archivo protegido/i
    );
  }
  await assert.rejects(
    uploadHelpers.downloadProtectedUpload('/uploads/proof.pdf', '../secret.pdf', { client, browser }),
    /nombre de descarga/i
  );

  assert.equal(requests, 0);
});

test('protected upload download revokes its object URL when DOM creation or click fails', async () => {
  assert.equal(typeof uploadHelpers.downloadProtectedUpload, 'function');
  const scenarios = [
    { createElement: () => { throw new Error('DOM unavailable'); } },
    { createElement: () => ({ click() { throw new Error('click blocked'); }, remove() {} }) },
  ];

  for (const document of scenarios) {
    const revocations = [];
    const browser = {
      URL: {
        createObjectURL: () => 'blob:cleanup-proof',
        revokeObjectURL: value => revocations.push(value),
      },
      document,
      setTimeout(callback) { callback(); },
    };
    await assert.rejects(
      uploadHelpers.downloadProtectedUpload('/uploads/proof-1.pdf', 'proof.pdf', {
        client: { get: async () => ({ data: new Blob(['proof']) }) },
        browser,
      }),
      /DOM unavailable|click blocked/
    );
    assert.deepEqual(revocations, ['blob:cleanup-proof']);
  }
});

const expensasPath = fileURLToPath(new URL('../src/pages/Expensas.jsx', import.meta.url));
let bundledExpensas;

function componentHooks() {
  const slots = [];
  const stateSlots = new Set();
  const effects = [];
  let cursor = 0;
  let mounted = true;
  return {
    api: {
      useState(initial) {
        const slot = cursor++;
        stateSlots.add(slot);
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (next) => {
          slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;
        }];
      },
      useRef(initial) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = { current: initial };
        return slots[slot];
      },
      useEffect(effect, dependencies) {
        const slot = cursor++;
        const previous = effects[slot];
        const changed = !previous || !dependencies
          || dependencies.some((value, index) => value !== previous.dependencies[index]);
        if (changed) {
          previous?.cleanup?.();
          effects[slot] = { effect, dependencies, pending: true, cleanup: null };
        }
      },
    },
    beginRender() { cursor = 0; mounted = true; },
    flushEffects() {
      for (const entry of effects) {
        if (!entry?.pending) continue;
        entry.pending = false;
        entry.cleanup = entry.effect() || null;
      }
    },
    unmount() {
      mounted = false;
      for (const entry of effects) entry?.cleanup?.();
    },
    isMounted() { return mounted; },
    stateSnapshot() {
      return [...stateSlots].sort((a, b) => a - b).map(slot => slots[slot]);
    },
    values: slots,
  };
}

function childNodes(node) {
  if (Array.isArray(node)) return node;
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  return Array.isArray(children) ? children : children == null ? [] : [children];
}

function allNodes(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of childNodes(node)) allNodes(child, predicate, found);
  return found;
}

function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return childNodes(node).map(textContent).join('');
}

async function expensasComponentCode() {
  if (!bundledExpensas) {
    bundledExpensas = build({
      entryPoints: [expensasPath],
      bundle: true,
      format: 'cjs',
      jsx: 'automatic',
      platform: 'node',
      write: false,
      plugins: [{
        name: 'manual-payment-page-boundaries',
        setup(buildApi) {
          const boundaries = [
            [/^react$/, 'react'],
            [/^react\/jsx-runtime$/, 'jsx-runtime'],
            [/services\/expensas(?:\.js)?$/, 'expensas'],
            [/services\/payments(?:\.js)?$/, 'payments'],
            [/services\/protectedUploads(?:\.js)?$/, 'protected-uploads'],
            [/context\/AuthContext(?:\.jsx)?$/, 'auth'],
            [/CreateExpensa(?:\.jsx)?$/, 'create-expense'],
            [/components\/Spinner(?:\.jsx)?$/, 'spinner'],
            [/services\/errors(?:\.js)?$/, 'errors'],
          ];
          for (const [filter, path] of boundaries) {
            buildApi.onResolve({ filter }, () => ({ path, namespace: 'test-boundary' }));
          }
          buildApi.onLoad({ filter: /.*/, namespace: 'test-boundary' }, ({ path }) => ({
            contents: `module.exports = globalThis.__testBoundaries[${JSON.stringify(path)}];`,
            loader: 'js',
          }));
        },
      }],
    }).then(result => result.outputFiles[0].text);
  }
  return bundledExpensas;
}

async function renderExpensas({
  user,
  residentRows = [],
  adminExpenses = [],
  unitRows = [],
  updateError = null,
  serviceOverrides = {},
  downloadOverride = null,
}) {
  const hooks = componentHooks();
  const calls = [];
  const expenseService = {
    listMy: async () => ({ data: residentRows }),
    listAll: async () => { calls.push(['listAll']); return { data: { data: adminExpenses, totalPages: 1 } }; },
    getUnitExpenses: async () => ({ data: { units: unitRows } }),
    submitPayment: async (...args) => { calls.push(['submit', ...args]); return { data: {} }; },
    confirmPayment: async (...args) => { calls.push(['approve', ...args]); return { data: {} }; },
    rejectPayment: async (...args) => { calls.push(['reject', ...args]); return { data: {} }; },
    update: async (...args) => {
      calls.push(['update', ...args]);
      if (updateError) throw updateError;
      return { data: { id: args[0], ...args[1] } };
    },
    ...serviceOverrides,
  };
  const jsx = (type, props, key) => typeof type === 'function'
    ? type(props || {})
    : ({ type, key, props: props || {} });
  const boundaries = {
    react: hooks.api,
    'jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    expensas: { expenseService },
    payments: { paymentService: { createPreference: () => assert.fail('MP must not be the pilot action') } },
    'protected-uploads': {
      downloadProtectedUpload: downloadOverride
        || (async (...args) => calls.push(['download', ...args])),
    },
    auth: { useAuth: () => ({ user }) },
    'create-expense': { default: () => null },
    spinner: { default: () => jsx('span', { children: 'Cargando' }) },
    errors: {
      getErrorMessage: (error, fallback) => error?.response?.data?.error
        || error?.response?.data?.message
        || fallback,
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    __testBoundaries: boundaries,
    Blob,
    File,
    FormData,
    console,
    globalThis: null,
    module,
    exports: module.exports,
    setTimeout,
    window: {},
  });
  context.globalThis = context;
  vm.runInContext(await expensasComponentCode(), context, { filename: 'Expensas.bundle.cjs' });
  const Component = module.exports.default;
  let tree;
  const render = () => {
    if (!hooks.isMounted()) return tree;
    hooks.beginRender();
    tree = Component();
    hooks.flushEffects();
    return tree;
  };
  render();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  render();
  return {
    calls,
    render,
    unmount: hooks.unmount,
    state: hooks.values,
    stateSnapshot: hooks.stateSnapshot,
    tree: () => tree,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function settleComponent(harness) {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  harness.render();
}

function nodeByText(tree, type, text) {
  return allNodes(tree, node => node?.type === type && textContent(node) === text)[0];
}

test('resident payment cards render manual proof upload and rejected retry without MercadoPago', async () => {
  const harness = await renderExpensas({
    user: { role: 'residente' },
    residentRows: [
      { id: 41, description: 'Agosto', status: 'pending', amount_owed: 1000 },
      { id: 42, description: 'Julio', status: 'rejected', amount_owed: 900 },
    ],
  });
  const rendered = textContent(harness.tree());
  const fileInputs = allNodes(harness.tree(), node => node?.type === 'input' && node.props.type === 'file');
  const buttons = allNodes(harness.tree(), node => node?.type === 'button').map(textContent);

  assert.equal(rendered.includes('PDF, JPG, JPEG o PNG'), true);
  assert.equal(rendered.includes('5 MiB'), true);
  assert.equal(rendered.includes('Rechazado'), true);
  assert.equal(rendered.includes('Pagar con MP'), false);
  assert.equal(fileInputs.length, 2);
  assert.equal(fileInputs.every(input => input.props.required === true), true);
  assert.deepEqual(buttons.filter(label => label === 'Enviar comprobante'), ['Enviar comprobante', 'Enviar comprobante']);
});

test('admin review renders authenticated download and proof-aware approve or recovery rejection', async () => {
  const expense = {
    id: 8,
    description: 'Agosto',
    fixed_amount: 100,
    extra_amount: 0,
    amount: 100,
    due_date: '2026-09-30',
  };
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expense],
    unitRows: [
      { id: 41, unit_number: '1A', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/proof-1.pdf' },
      { id: 42, unit_number: '1B', amount_owed: 100, status: 'in_review', payment_proof_url: null },
      { id: 43, unit_number: '1C', amount_owed: 100, status: 'paid', payment_proof_url: null },
    ],
  });
  await Promise.resolve();
  harness.render();
  const row = allNodes(
    harness.tree(),
    node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Agosto')
  )[0];
  assert.ok(row, `expected clickable expense row in: ${textContent(harness.tree())}; calls: ${JSON.stringify(harness.calls)}; state: ${JSON.stringify(harness.state)}`);
  await row.props.onClick();
  await Promise.resolve();
  harness.render();

  const rows = allNodes(harness.tree(), node => node?.type === 'tr');
  const proofRow = rows.find(node => textContent(node).includes('1A'));
  const historicalRow = rows.find(node => textContent(node).includes('1B'));
  const paidHistoryRow = rows.find(node => textContent(node).includes('1C'));

  assert.equal(textContent(proofRow).includes('Descargar comprobante'), true);
  assert.equal(textContent(proofRow).includes('Aprobar'), true);
  assert.equal(textContent(proofRow).includes('Rechazar'), true);
  assert.equal(textContent(historicalRow).includes('Aprobar'), false);
  assert.equal(textContent(historicalRow).includes('Rechazar'), true);
  assert.equal(textContent(paidHistoryRow).includes('Comprobante faltante'), false);
});

test('admin expense edits keep the form visible and surface backend payment-activity conflicts', async () => {
  const conflictText = 'No se pueden redistribuir montos con comprobantes o actividad de pago';
  const expense = {
    id: 8,
    description: 'Agosto',
    fixed_amount: 100,
    extra_amount: 0,
    amount: 100,
    due_date: '2026-09-30',
    period: '2026-09',
  };
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expense],
    unitRows: [{
      id: 41,
      unit_number: '1A',
      amount_owed: 100,
      status: 'in_review',
      payment_proof_url: '/uploads/proof-1.pdf',
    }],
    updateError: { response: { status: 409, data: { error: conflictText } } },
  });
  const expenseRow = allNodes(
    harness.tree(),
    node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Agosto')
  )[0];
  await expenseRow.props.onClick();
  await Promise.resolve();
  harness.render();

  const editButton = allNodes(harness.tree(), node => node?.type === 'button' && textContent(node) === 'Editar expensa')[0];
  assert.ok(editButton, 'admin detail must expose metadata and amount editing');
  editButton.props.onClick();
  harness.render();

  const fixedInput = allNodes(harness.tree(), node => node?.type === 'input' && node.props.name === 'fixedAmount')[0];
  fixedInput.props.onChange({ target: { name: 'fixedAmount', value: '125' } });
  harness.render();
  const editForm = allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0];
  await editForm.props.onSubmit({ preventDefault() {} });
  harness.render();

  assert.equal(textContent(harness.tree()).includes(conflictText), true);
  assert.ok(allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0]);
  assert.equal(harness.calls.some(call => call[0] === 'update' && call[2].fixedAmount === '125'), true);
});

test('admin detail ignores deferred A completion and never exposes A controls under B failure', async () => {
  const expenseA = { id: 8, description: 'Expensa A', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30' };
  const expenseB = { id: 9, description: 'Expensa B', fixed_amount: 200, extra_amount: 0, amount: 200, due_date: '2026-10-30' };
  const detailA = deferred();
  const detailB = deferred();
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expenseA, expenseB],
    serviceOverrides: {
      getUnitExpenses: id => (id === 8 ? detailA.promise : detailB.promise),
    },
  });
  const rows = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick);
  const rowA = rows.find(node => textContent(node).includes('Expensa A'));
  const rowB = rows.find(node => textContent(node).includes('Expensa B'));

  const openA = rowA.props.onClick();
  harness.render();
  const openB = rowB.props.onClick();
  harness.render();
  detailA.resolve({ data: { units: [{ id: 41, unit_number: 'A-ROW', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/a.pdf' }] } });
  await openA;
  await settleComponent(harness);

  assert.equal(textContent(harness.tree()).includes('Expensa B'), true);
  assert.equal(textContent(harness.tree()).includes('A-ROW'), false, 'late A detail must not become actionable under B');

  detailB.reject({ response: { data: { error: 'No se pudo leer B' } } });
  await openB;
  await settleComponent(harness);
  assert.equal(textContent(harness.tree()).includes('No se pudo leer B'), true);
  assert.equal(textContent(harness.tree()).includes('Aprobar'), false);
  assert.equal(textContent(harness.tree()).includes('Rechazar'), false);
  assert.equal(textContent(harness.tree()).includes('Descargar comprobante'), false);
});

test('admin detail completion after unmount cannot publish rows or loading state', async () => {
  const detail = deferred();
  const expense = { id: 8, description: 'Expensa A', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30' };
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expense],
    serviceOverrides: { getUnitExpenses: () => detail.promise },
  });
  const row = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Expensa A'))[0];
  const opening = row.props.onClick();
  harness.render();
  harness.unmount();
  const stateAfterUnmount = structuredClone(harness.stateSnapshot());

  detail.resolve({ data: { units: [{ id: 41, unit_number: 'LATE', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/a.pdf' }] } });
  await opening;
  await Promise.resolve();
  assert.equal(JSON.stringify(harness.stateSnapshot()), JSON.stringify(stateAfterUnmount));
});

test('admin blocks editing until the initial detail request settles', async () => {
  const detail = deferred();
  const expense = { id: 8, description: 'Original', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30' };
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expense],
    serviceOverrides: { getUnitExpenses: () => detail.promise },
  });
  const expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Original'))[0];
  const opening = expenseRow.props.onClick();
  harness.render();

  let editButton = nodeByText(harness.tree(), 'button', 'Editar expensa');
  assert.equal(editButton.props.disabled, true, 'an edit cannot race the still-pending initial detail');
  editButton.props.onClick();
  harness.render();
  assert.equal(allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form').length, 0, 'the handler must also reject a synthetic click while disabled');

  detail.resolve({ data: { units: [] } });
  await opening;
  await settleComponent(harness);
  editButton = nodeByText(harness.tree(), 'button', 'Editar expensa');
  assert.equal(editButton.props.disabled, false);
  editButton.props.onClick();
  harness.render();
  assert.equal(allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form').length, 1);
});

test('admin keeps two row mutations independently busy and ignores repeat attempts', async () => {
  const approve = deferred();
  const reject = deferred();
  let approveCalls = 0;
  let rejectCalls = 0;
  const expense = { id: 8, description: 'Agosto', fixed_amount: 200, extra_amount: 0, amount: 200, due_date: '2026-09-30' };
  const initialUnits = [
    { id: 41, unit_number: '1A', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/a.pdf' },
    { id: 42, unit_number: '1B', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/b.pdf' },
  ];
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expense],
    unitRows: initialUnits,
    serviceOverrides: {
      confirmPayment: () => { approveCalls += 1; return approve.promise; },
      rejectPayment: () => { rejectCalls += 1; return reject.promise; },
    },
  });
  const expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Agosto'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  let rowA = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  let rowB = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1B'))[0];
  const approveButton = nodeByText(rowA, 'button', 'Aprobar');
  const rejectButton = nodeByText(rowB, 'button', 'Rechazar');
  const pendingApprove = approveButton.props.onClick();
  harness.render();
  const pendingReject = rejectButton.props.onClick();
  harness.render();
  const repeatApprove = approveButton.props.onClick();
  await Promise.resolve();

  rowA = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  rowB = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1B'))[0];
  assert.equal(textContent(rowA).includes('Aprobando...'), true);
  assert.equal(textContent(rowB).includes('Rechazando...'), true);
  assert.equal(approveCalls, 1, 'repeat click on the same busy row must not duplicate a mutation');
  assert.equal(rejectCalls, 1);

  approve.resolve({ data: { ...initialUnits[0], status: 'paid' } });
  await Promise.all([pendingApprove, repeatApprove]);
  await settleComponent(harness);
  rowB = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1B'))[0];
  assert.equal(textContent(rowB).includes('Rechazando...'), true, 'A completion must not release B busy state');
  assert.equal(allNodes(rowB, node => node?.type === 'button').every(button => button.props.disabled), true);

  reject.resolve({ data: { ...initialUnits[1], status: 'rejected' } });
  await pendingReject;
  await settleComponent(harness);
});

test('admin ignores an older row reconciliation after another row commits', async () => {
  const approve = deferred();
  const reject = deferred();
  const detailAfterApprove = deferred();
  const detailAfterReject = deferred();
  const expense = { id: 8, description: 'Agosto', fixed_amount: 200, extra_amount: 0, amount: 200, due_date: '2026-09-30' };
  const initialUnits = [
    { id: 41, unit_number: '1A', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/a.pdf' },
    { id: 42, unit_number: '1B', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/b.pdf' },
  ];
  let detailCalls = 0;
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expense],
    serviceOverrides: {
      getUnitExpenses: () => {
        detailCalls += 1;
        if (detailCalls === 1) return Promise.resolve({ data: { units: initialUnits } });
        if (detailCalls === 2) return detailAfterApprove.promise;
        return detailAfterReject.promise;
      },
      confirmPayment: () => approve.promise,
      rejectPayment: () => reject.promise,
    },
  });
  const expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Agosto'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  let rowA = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  let rowB = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1B'))[0];
  const pendingApprove = nodeByText(rowA, 'button', 'Aprobar').props.onClick();
  const pendingReject = nodeByText(rowB, 'button', 'Rechazar').props.onClick();

  approve.resolve({ data: { ...initialUnits[0], status: 'paid' } });
  await Promise.resolve();
  reject.resolve({ data: { ...initialUnits[1], status: 'rejected' } });
  await Promise.resolve();
  detailAfterReject.resolve({ data: { units: [
    { ...initialUnits[0], status: 'paid' },
    { ...initialUnits[1], status: 'rejected' },
  ] } });
  await pendingReject;
  await settleComponent(harness);

  detailAfterApprove.resolve({ data: { units: [
    { ...initialUnits[0], status: 'paid' },
    initialUnits[1],
  ] } });
  await pendingApprove;
  await settleComponent(harness);

  rowA = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  rowB = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1B'))[0];
  assert.equal(textContent(rowA).includes('Pagado'), true);
  assert.equal(textContent(rowB).includes('Rechazado'), true, 'older A readback must not restore B review state');
  assert.equal(textContent(rowB).includes('Rechazar'), false);
});

test('admin ignores an older review readback after a later metadata edit reconciles', async () => {
  const oldReviewDetail = deferred();
  const oldReviewList = deferred();
  const original = { id: 8, description: 'Original', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30', period: '2026-09' };
  const saved = { ...original, description: 'Saved description', fixed_amount: 125, amount: 125, period: '2026-10' };
  const reviewUnit = { id: 41, unit_number: '1A', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/a.pdf' };
  const paidUnit = { ...reviewUnit, status: 'paid' };
  const savedUnit = { ...paidUnit, amount_owed: 125 };
  let detailCalls = 0;
  let listCalls = 0;
  const harness = await renderExpensas({
    user: { role: 'admin' },
    serviceOverrides: {
      listAll: async () => {
        listCalls += 1;
        if (listCalls === 1) return { data: { data: [original], totalPages: 1 } };
        if (listCalls === 2) return oldReviewList.promise;
        return { data: { data: [saved], totalPages: 1 } };
      },
      getUnitExpenses: () => {
        detailCalls += 1;
        if (detailCalls === 1) return Promise.resolve({ data: { units: [reviewUnit] } });
        if (detailCalls === 2) return oldReviewDetail.promise;
        return Promise.resolve({ data: { units: [savedUnit] } });
      },
      confirmPayment: async () => ({ data: paidUnit }),
      update: async () => ({ data: saved }),
    },
  });
  const expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Original'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  const unitRow = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  const pendingReview = nodeByText(unitRow, 'button', 'Aprobar').props.onClick();
  await Promise.resolve();
  await Promise.resolve();
  oldReviewList.resolve({ data: { data: [original], totalPages: 1 } });
  await settleComponent(harness);
  harness.render();

  nodeByText(harness.tree(), 'button', 'Editar expensa').props.onClick();
  harness.render();
  const editForm = allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0];
  await editForm.props.onSubmit({ preventDefault() {} });
  await settleComponent(harness);
  assert.equal(textContent(allNodes(harness.tree(), node => node?.type === 'h3')[0]), 'Saved description');
  assert.equal(textContent(harness.tree()).includes('$125'), true);

  oldReviewDetail.resolve({ data: { units: [paidUnit] } });
  await pendingReview;
  await settleComponent(harness);
  assert.equal(textContent(allNodes(harness.tree(), node => node?.type === 'h3')[0]), 'Saved description', 'older review header must not replace the later edit readback');
  assert.equal(textContent(harness.tree()).includes('$125'), true, 'older review detail must not restore pre-edit unit amounts');
});

test('resident applies committed submission before failed refresh and offers reconciliation retry', async () => {
  const pending = { id: 41, description: 'Agosto', status: 'pending', amount_owed: 100, payment_proof_url: null };
  const committed = { id: 41, status: 'in_review', payment_proof_url: '/uploads/new.pdf' };
  let listCalls = 0;
  const harness = await renderExpensas({
    user: { role: 'residente' },
    serviceOverrides: {
      listMy: async () => {
        listCalls += 1;
        if (listCalls === 1) return { data: [pending] };
        if (listCalls === 2) throw { response: { data: { error: 'Lectura temporalmente no disponible' } } };
        return { data: [{ ...pending, ...committed }] };
      },
      submitPayment: async () => ({ data: committed }),
    },
  });
  const input = allNodes(harness.tree(), node => node?.type === 'input' && node.props.type === 'file')[0];
  input.props.onChange({ target: { files: [new File(['proof'], 'proof.pdf', { type: 'application/pdf' })] } });
  harness.render();
  const form = allNodes(harness.tree(), node => node?.type === 'form')[0];
  await form.props.onSubmit({ preventDefault() {} });
  await settleComponent(harness);

  let rendered = textContent(harness.tree());
  assert.equal(rendered.includes('En revisión'), true);
  assert.equal(rendered.includes('Enviar comprobante'), false);
  assert.equal(rendered.includes('Comprobante enviado'), true);
  assert.equal(rendered.includes('No pudimos actualizar el listado'), true);
  const retry = nodeByText(harness.tree(), 'button', 'Reintentar actualización');
  assert.ok(retry);
  await retry.props.onClick();
  await settleComponent(harness);
  rendered = textContent(harness.tree());
  assert.equal(rendered.includes('No pudimos actualizar el listado'), false);
  assert.equal(listCalls, 3);
});

test('admin applies committed approve and reject rows even when reconciliation reads fail', async () => {
  const expense = { id: 8, description: 'Agosto', fixed_amount: 200, extra_amount: 0, amount: 200, due_date: '2026-09-30' };
  const reviewRows = [
    { id: 41, unit_number: '1A', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/a.pdf' },
    { id: 42, unit_number: '1B', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/b.pdf' },
  ];
  let detailCalls = 0;
  let listCalls = 0;
  let readsRecover = false;
  const harness = await renderExpensas({
    user: { role: 'admin' },
    serviceOverrides: {
      listAll: async () => {
        listCalls += 1;
        if (listCalls === 1 || readsRecover) return { data: { data: [expense], totalPages: 1 } };
        throw { response: { data: { error: 'Lista no disponible' } } };
      },
      getUnitExpenses: async () => {
        detailCalls += 1;
        if (detailCalls === 1) return { data: { units: reviewRows } };
        if (readsRecover) return { data: { units: [{ ...reviewRows[0], status: 'paid' }, { ...reviewRows[1], status: 'rejected' }] } };
        throw { response: { data: { error: 'Detalle no disponible' } } };
      },
      confirmPayment: async () => ({ data: { ...reviewRows[0], status: 'paid' } }),
      rejectPayment: async () => ({ data: { ...reviewRows[1], status: 'rejected' } }),
    },
  });
  const expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Agosto'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  let rowA = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  await nodeByText(rowA, 'button', 'Aprobar').props.onClick();
  await settleComponent(harness);
  let rowB = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1B'))[0];
  await nodeByText(rowB, 'button', 'Rechazar').props.onClick();
  await settleComponent(harness);

  rowA = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  rowB = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1B'))[0];
  assert.equal(textContent(rowA).includes('Pagado'), true);
  assert.equal(textContent(rowA).includes('Aprobar'), false);
  assert.equal(textContent(rowB).includes('Rechazado'), true);
  assert.equal(textContent(rowB).includes('Rechazar'), false);
  assert.equal(textContent(harness.tree()).includes('No pudimos actualizar los datos'), true);
  assert.equal(textContent(harness.tree()).includes('Error al aprobar'), false);
  assert.equal(textContent(harness.tree()).includes('Error al rechazar'), false);

  readsRecover = true;
  const retry = nodeByText(harness.tree(), 'button', 'Reintentar actualización');
  assert.ok(retry);
  await retry.props.onClick();
  await settleComponent(harness);
  assert.equal(textContent(harness.tree()).includes('No pudimos actualizar los datos'), false);
});

test('late review, edit and download completions cannot replace a reopened expense', async () => {
  const expenseA = { id: 8, description: 'Expensa A', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30' };
  const expenseB = { id: 9, description: 'Expensa B', fixed_amount: 200, extra_amount: 0, amount: 200, due_date: '2026-10-30' };
  const unitA = { id: 41, unit_number: 'A-ROW', amount_owed: 100, status: 'in_review', payment_proof_url: '/uploads/a.pdf' };
  const unitB = { id: 51, unit_number: 'B-ROW', amount_owed: 200, status: 'in_review', payment_proof_url: '/uploads/b.pdf' };
  const review = deferred();
  const edit = deferred();
  const download = deferred();
  let reviewCalls = 0;
  let downloadCalls = 0;
  const harness = await renderExpensas({
    user: { role: 'admin' },
    adminExpenses: [expenseA, expenseB],
    serviceOverrides: {
      getUnitExpenses: async id => ({ data: { units: id === 8 ? [unitA] : [unitB] } }),
      confirmPayment: () => { reviewCalls += 1; return review.promise; },
      update: () => edit.promise,
    },
    downloadOverride: () => { downloadCalls += 1; return download.promise; },
  });
  let expenseRows = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick);
  const openA = expenseRows.find(node => textContent(node).includes('Expensa A'));
  const openB = expenseRows.find(node => textContent(node).includes('Expensa B'));
  await openA.props.onClick();
  await settleComponent(harness);
  let unitRow = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('A-ROW'))[0];
  const pendingReview = nodeByText(unitRow, 'button', 'Aprobar').props.onClick();
  harness.render();
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openA.props.onClick();
  await settleComponent(harness);
  unitRow = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('A-ROW'))[0];
  const reopenedApprove = nodeByText(unitRow, 'button', 'Aprobando...');
  assert.equal(reopenedApprove.props.disabled, true);
  await reopenedApprove.props.onClick();
  assert.equal(reviewCalls, 1);
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openB.props.onClick();
  await settleComponent(harness);
  review.resolve({ data: { ...unitA, status: 'paid' } });
  await pendingReview;
  await settleComponent(harness);
  assert.equal(textContent(harness.tree()).includes('Expensa B'), true);
  assert.equal(textContent(harness.tree()).includes('A-ROW'), false);

  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openA.props.onClick();
  await settleComponent(harness);
  await nodeByText(harness.tree(), 'button', 'Reintentar actualización').props.onClick();
  await settleComponent(harness);
  nodeByText(harness.tree(), 'button', 'Editar expensa').props.onClick();
  harness.render();
  const editForm = allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0];
  const pendingEdit = editForm.props.onSubmit({ preventDefault() {} });
  harness.render();
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openA.props.onClick();
  await settleComponent(harness);
  const reopenedEdit = nodeByText(harness.tree(), 'button', 'Guardando...');
  assert.equal(reopenedEdit.props.disabled, true);
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openB.props.onClick();
  await settleComponent(harness);
  edit.resolve({ data: { ...expenseA, description: 'Expensa A editada' } });
  await pendingEdit;
  await settleComponent(harness);
  assert.equal(textContent(allNodes(harness.tree(), node => node?.type === 'h3')[0]), 'Expensa B');

  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openA.props.onClick();
  await settleComponent(harness);
  await nodeByText(harness.tree(), 'button', 'Reintentar actualización').props.onClick();
  await settleComponent(harness);
  unitRow = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('A-ROW'))[0];
  const pendingDownload = nodeByText(unitRow, 'button', 'Descargar comprobante').props.onClick();
  harness.render();
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openA.props.onClick();
  await settleComponent(harness);
  unitRow = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('A-ROW'))[0];
  const reopenedDownload = nodeByText(unitRow, 'button', 'Descargando...');
  assert.equal(reopenedDownload.props.disabled, true);
  await reopenedDownload.props.onClick();
  assert.equal(downloadCalls, 1);
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();
  await openB.props.onClick();
  await settleComponent(harness);
  download.reject(new Error('Descarga A falló'));
  await pendingDownload;
  await settleComponent(harness);
  assert.equal(textContent(harness.tree()).includes('Expensa B'), true);
  assert.equal(textContent(harness.tree()).includes('Descarga A falló'), false);
});

test('admin retry refreshes a reopened expense header before unlocking edit', async () => {
  const original = { id: 8, description: 'Original', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30', period: '2026-09' };
  const saved = { ...original, description: 'Saved description', fixed_amount: 125, amount: 125, period: '2026-10' };
  const update = deferred();
  let mutationCommitted = false;
  const harness = await renderExpensas({
    user: { role: 'admin' },
    serviceOverrides: {
      listAll: async () => ({ data: { data: [mutationCommitted ? saved : original], totalPages: 1 } }),
      getUnitExpenses: async () => ({ data: { units: [] } }),
      update: () => update.promise,
    },
  });
  let expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Original'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  nodeByText(harness.tree(), 'button', 'Editar expensa').props.onClick();
  harness.render();
  const editForm = allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0];
  const pendingEdit = editForm.props.onSubmit({ preventDefault() {} });
  harness.render();
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();

  expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Original'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  mutationCommitted = true;
  update.resolve({ data: saved });
  await pendingEdit;
  await settleComponent(harness);

  assert.equal(textContent(allNodes(harness.tree(), node => node?.type === 'h3')[0]), 'Original', 'the obsolete completion itself must remain lifecycle-suppressed');
  const retry = nodeByText(harness.tree(), 'button', 'Reintentar actualización');
  assert.ok(retry);
  await retry.props.onClick();
  await settleComponent(harness);

  assert.equal(textContent(allNodes(harness.tree(), node => node?.type === 'h3')[0]), 'Saved description');
  const editButton = nodeByText(harness.tree(), 'button', 'Editar expensa');
  assert.equal(editButton.props.disabled, false);
  editButton.props.onClick();
  harness.render();
  const description = allNodes(harness.tree(), node => node?.type === 'input' && node.props.name === 'description')[0];
  assert.equal(description.props.value, 'Saved description');
});

test('admin retry supersedes the reopened initial detail read', async () => {
  const original = { id: 8, description: 'Original', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30', period: '2026-09' };
  const saved = { ...original, description: 'Saved description', fixed_amount: 125, amount: 125, period: '2026-10' };
  const originalUnit = { id: 41, unit_number: '1A', amount_owed: 100, status: 'pending', payment_proof_url: null };
  const savedUnit = { ...originalUnit, amount_owed: 125 };
  const update = deferred();
  const lateInitialDetail = deferred();
  let mutationCommitted = false;
  let detailCalls = 0;
  const harness = await renderExpensas({
    user: { role: 'admin' },
    serviceOverrides: {
      listAll: async () => ({ data: { data: [mutationCommitted ? saved : original], totalPages: 1 } }),
      getUnitExpenses: () => {
        detailCalls += 1;
        if (detailCalls === 1) return Promise.resolve({ data: { units: [originalUnit] } });
        if (detailCalls === 2) return lateInitialDetail.promise;
        return Promise.resolve({ data: { units: [savedUnit] } });
      },
      update: () => update.promise,
    },
  });
  let expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Original'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  nodeByText(harness.tree(), 'button', 'Editar expensa').props.onClick();
  harness.render();
  let editForm = allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0];
  allNodes(editForm, node => node?.type === 'input' && node.props.name === 'description')[0]
    .props.onChange({ target: { name: 'description', value: 'Saved description' } });
  allNodes(editForm, node => node?.type === 'input' && node.props.name === 'fixedAmount')[0]
    .props.onChange({ target: { name: 'fixedAmount', value: '125' } });
  harness.render();
  editForm = allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0];
  const pendingEdit = editForm.props.onSubmit({ preventDefault() {} });
  harness.render();
  nodeByText(harness.tree(), 'button', 'Cerrar').props.onClick();
  harness.render();

  expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Original'))[0];
  const reopening = expenseRow.props.onClick();
  harness.render();
  mutationCommitted = true;
  update.resolve({ data: saved });
  await pendingEdit;
  await settleComponent(harness);

  let retry = nodeByText(harness.tree(), 'button', 'Reintentar actualización');
  assert.ok(retry, 'the obsolete committed edit must expose reconciliation retry');
  assert.equal(Boolean(retry.props.disabled), false, 'the rendered retry is enabled while the reopened initial detail is pending');
  await retry.props.onClick();
  await settleComponent(harness);
  let unitRow = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  assert.equal(textContent(unitRow).includes('$125'), true);
  assert.equal(textContent(allNodes(harness.tree(), node => node?.type === 'h3')[0]), 'Saved description');
  assert.equal(nodeByText(harness.tree(), 'button', 'Editar expensa').props.disabled, false);

  lateInitialDetail.resolve({ data: { units: [originalUnit] } });
  await reopening;
  await settleComponent(harness);
  unitRow = allNodes(harness.tree(), node => node?.type === 'tr' && textContent(node).includes('1A'))[0];
  assert.equal(textContent(unitRow).includes('$125'), true, 'the obsolete initial read must not restore the pre-edit amount');
  assert.equal(textContent(allNodes(harness.tree(), node => node?.type === 'h3')[0]), 'Saved description');
  assert.equal(nodeByText(harness.tree(), 'button', 'Editar expensa').props.disabled, false);
});

test('committed edit stays successful when list and detail reconciliation fail', async () => {
  const expense = { id: 8, description: 'Agosto', fixed_amount: 100, extra_amount: 0, amount: 100, due_date: '2026-09-30', period: '2026-09' };
  let detailCalls = 0;
  let listCalls = 0;
  const harness = await renderExpensas({
    user: { role: 'admin' },
    serviceOverrides: {
      listAll: async () => {
        listCalls += 1;
        if (listCalls === 1) return { data: { data: [expense], totalPages: 1 } };
        throw { response: { data: { error: 'Lista no disponible' } } };
      },
      getUnitExpenses: async () => {
        detailCalls += 1;
        if (detailCalls === 1) return { data: { units: [] } };
        throw { response: { data: { error: 'Detalle no disponible' } } };
      },
      update: async () => ({ data: { ...expense, description: 'Agosto actualizado', period: '2026-10' } }),
    },
  });
  const expenseRow = allNodes(harness.tree(), node => node?.type === 'div' && node.props?.onClick && textContent(node).includes('Agosto'))[0];
  await expenseRow.props.onClick();
  await settleComponent(harness);
  nodeByText(harness.tree(), 'button', 'Editar expensa').props.onClick();
  harness.render();
  const form = allNodes(harness.tree(), node => node?.type === 'form' && node.props.id === 'edit-expense-form')[0];
  await form.props.onSubmit({ preventDefault() {} });
  await settleComponent(harness);

  const rendered = textContent(harness.tree());
  assert.equal(rendered.includes('Agosto actualizado'), true);
  assert.equal(rendered.includes('Expensa actualizada'), true);
  assert.equal(rendered.includes('No pudimos actualizar los datos'), true);
  assert.equal(rendered.includes('No pudimos actualizar la expensa'), false);
});

test('initial list error is distinct from a legitimate empty result', async () => {
  const failed = await renderExpensas({
    user: { role: 'residente' },
    serviceOverrides: {
      listMy: async () => { throw { response: { data: { error: 'Listado no disponible' } } }; },
    },
  });
  assert.equal(textContent(failed.tree()).includes('Listado no disponible'), true);
  assert.equal(textContent(failed.tree()).includes('No tenés expensas pendientes'), false);

  const empty = await renderExpensas({ user: { role: 'residente' }, residentRows: [] });
  assert.equal(textContent(empty.tree()).includes('No tenés expensas pendientes'), true);
  assert.equal(allNodes(empty.tree(), node => node?.props?.role === 'alert').length, 0);
});
