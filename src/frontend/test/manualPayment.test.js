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
  const effects = [];
  let cursor = 0;
  return {
    api: {
      useState(initial) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (next) => {
          slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;
        }];
      },
      useEffect(effect, dependencies) {
        const slot = cursor++;
        const previous = effects[slot];
        const changed = !previous || !dependencies
          || dependencies.some((value, index) => value !== previous.dependencies[index]);
        if (changed) effects[slot] = { effect, dependencies, pending: true };
      },
    },
    beginRender() { cursor = 0; },
    flushEffects() {
      for (const entry of effects) {
        if (!entry?.pending) continue;
        entry.pending = false;
        entry.effect();
      }
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

async function renderExpensas({ user, residentRows = [], adminExpenses = [], unitRows = [], updateError = null }) {
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
  };
  const jsx = (type, props, key) => typeof type === 'function'
    ? type(props || {})
    : ({ type, key, props: props || {} });
  const boundaries = {
    react: hooks.api,
    'jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    expensas: { expenseService },
    payments: { paymentService: { createPreference: () => assert.fail('MP must not be the pilot action') } },
    'protected-uploads': { downloadProtectedUpload: async (...args) => calls.push(['download', ...args]) },
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
  return { calls, render, state: hooks.values, tree: () => tree };
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
