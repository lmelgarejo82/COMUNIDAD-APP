import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let capabilityModule = {};
try {
  capabilityModule = await import('../src/services/capabilities.js');
} catch {}

function hooksHarness() {
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
      useRef(initial) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = { current: initial };
        return slots[slot];
      },
      useEffect(effect, dependencies) {
        const slot = cursor++;
        const prior = effects[slot];
        const changed = !prior || !dependencies
          || dependencies.some((value, index) => value !== prior.dependencies[index]);
        if (changed) effects[slot] = { effect, dependencies, pending: true, cleanup: prior?.cleanup };
      },
    },
    begin() { cursor = 0; },
    flush() {
      for (const entry of effects) {
        if (!entry?.pending) continue;
        entry.pending = false;
        entry.cleanup?.();
        entry.cleanup = entry.effect() || null;
      }
    },
  };
}

function children(node) {
  if (Array.isArray(node)) return node;
  if (!node || typeof node !== 'object') return [];
  const value = node.props?.children;
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function nodes(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of children(node)) nodes(child, predicate, found);
  return found;
}

function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return children(node).map(textContent).join('');
}

async function settle(render, flush) {
  flush();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  render();
  flush();
  await Promise.resolve();
  render();
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

test('capability service caches one request and projects only literal true fields', async () => {
  assert.equal(typeof capabilityModule.createCapabilityService, 'function');
  let calls = 0;
  const service = capabilityModule.createCapabilityService({
    async get(path) {
      calls += 1;
      assert.equal(path, '/health');
      return {
        data: {
          status: 'ok',
          capabilities: { aiAssistant: true, mercadoPago: 1, automaticWhatsApp: 'true' },
          credential: 'must-not-project',
        },
      };
    },
  });

  const [first, second] = await Promise.all([service.get(), service.get()]);
  assert.deepEqual(first, { aiAssistant: true, mercadoPago: false, automaticWhatsApp: false });
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(first).sort(), ['aiAssistant', 'automaticWhatsApp', 'mercadoPago']);
});

test('capability service fails closed for rejected and malformed health responses', async () => {
  assert.equal(typeof capabilityModule.createCapabilityService, 'function');
  const unavailable = { aiAssistant: false, mercadoPago: false, automaticWhatsApp: false };
  const rejected = capabilityModule.createCapabilityService({ get: async () => { throw new Error('offline'); } });
  const malformed = capabilityModule.createCapabilityService({ get: async () => ({ data: { capabilities: null } }) });

  assert.deepEqual(await rejected.get(), unavailable);
  assert.deepEqual(await malformed.get(), unavailable);
});

const layoutPath = fileURLToPath(new URL('../src/components/Layout.jsx', import.meta.url));

async function renderLayout({
  width,
  capabilities,
  phone = '+5491112345678',
  role = 'residente',
  capabilityServiceOverride = null,
}) {
  const hooks = hooksHarness();
  let capabilityCalls = 0;
  const selectedCapabilityService = capabilityServiceOverride || {
    async get() { return capabilities; },
  };
  const output = await build({
    entryPoints: [layoutPath], bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic', write: false,
    plugins: [{
      name: 'layout-test-boundaries',
      setup(api) {
        const boundaries = [
          [/^react$/, 'react'], [/^react\/jsx-runtime$/, 'jsx-runtime'],
          [/^react-router-dom$/, 'router'], [/context\/AuthContext/, 'auth'],
          [/context\/CommunityContext/, 'community'], [/services\/comunicacion/, 'communication'],
          [/services\/capabilities/, 'capabilities'], [/services\/api(?:\.js)?$/, 'api'],
          [/ScopeSelector/, 'scope-selector'],
        ];
        for (const [filter, path] of boundaries) api.onResolve({ filter }, () => ({ path, namespace: 'test' }));
        api.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
          contents: `module.exports = globalThis.__boundaries[${JSON.stringify(path)}];`, loader: 'js',
        }));
      },
    }],
  });
  const jsx = (type, props, key) => typeof type === 'function' ? type(props || {}) : ({ type, key, props: props || {} });
  const ChatMarker = () => jsx('div', { 'data-capability': 'ai-chat', children: 'Asistente' });
  const boundaries = {
    react: {
      ...hooks.api,
      lazy() { return ChatMarker; },
      Suspense({ children: value }) { return value; },
    },
    'jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    router: {
      Outlet: () => null,
      Link: ({ children: value, ...props }) => jsx('a', { ...props, children: value }),
      useLocation: () => ({ pathname: '/dashboard' }),
    },
    auth: { useAuth: () => ({ user: { role, email: 'resident@example.test' }, logout() {} }) },
    community: { useCommunity: () => ({ complexes: [], selectedId: null, setSelectedId() {}, fetchComplexes() {} }) },
    communication: { notificationService: { count: async () => ({ data: { count: 0 } }) } },
    capabilities: {
      capabilityService: {
        get() { capabilityCalls += 1; return selectedCapabilityService.get(); },
      },
    },
    api: { get: async () => ({ data: { phone } }) },
    'scope-selector': { default: () => null },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    __boundaries: boundaries, globalThis: null, module, exports: module.exports, console,
    window: { innerWidth: width, addEventListener() {}, removeEventListener() {} },
    setInterval: () => 1, clearInterval() {}, setTimeout,
  });
  context.globalThis = context;
  vm.runInContext(output.outputFiles[0].text, context, { filename: 'Layout.bundle.cjs' });
  const Component = module.exports.default;
  let tree;
  const render = () => { hooks.begin(); tree = Component({}); return tree; };
  render();
  await settle(render, () => hooks.flush());
  return {
    get tree() { return tree; },
    get capabilityCalls() { return capabilityCalls; },
    settle: () => settle(render, () => hooks.flush()),
  };
}

test('Layout hides AI when unavailable while retaining explicit manual wa.me on desktop and mobile', async () => {
  const unavailable = { aiAssistant: false, mercadoPago: false, automaticWhatsApp: false };
  for (const width of [1366, 390]) {
    const rendered = await renderLayout({ width, capabilities: unavailable });
    assert.equal(nodes(rendered.tree, (node) => node?.props?.['data-capability'] === 'ai-chat').length, 0);
    const waLinks = nodes(rendered.tree, (node) => node?.type === 'a' && node.props?.href?.startsWith('https://wa.me/'));
    assert.equal(waLinks.length, 1);
    assert.equal(waLinks[0].props.href, 'https://wa.me/5491112345678');
    assert.equal(rendered.capabilityCalls, 1);
  }
});

test('Layout renders AI only after a literal true capability and keeps guards excluded', async () => {
  const enabled = await renderLayout({
    width: 1366,
    capabilities: { aiAssistant: true, mercadoPago: false, automaticWhatsApp: false },
  });
  assert.equal(nodes(enabled.tree, (node) => node?.props?.['data-capability'] === 'ai-chat').length, 1);

  const guard = await renderLayout({
    width: 1366,
    role: 'access_operator',
    capabilities: { aiAssistant: true, mercadoPago: false, automaticWhatsApp: false },
  });
  assert.equal(nodes(guard.tree, (node) => node?.props?.['data-capability'] === 'ai-chat').length, 0);
  assert.equal(nodes(guard.tree, (node) => node?.type === 'a' && node.props?.href?.startsWith('https://wa.me/')).length, 0);
});

test('Layout stays fail-closed while capability reads are pending and after malformed or rejected settlement', async () => {
  for (const outcome of ['malformed', 'rejected']) {
    const pending = deferred();
    const service = capabilityModule.createCapabilityService({ get: () => pending.promise });
    const rendered = await renderLayout({
      width: 390,
      capabilityServiceOverride: service,
    });
    assert.equal(nodes(rendered.tree, (node) => node?.props?.['data-capability'] === 'ai-chat').length, 0);
    assert.equal(nodes(rendered.tree, (node) => node?.type === 'a' && node.props?.href?.startsWith('https://wa.me/')).length, 1);

    if (outcome === 'malformed') {
      pending.resolve({ data: { capabilities: { aiAssistant: 'true', mercadoPago: 1 } } });
    } else {
      pending.reject(new Error('synthetic health failure'));
    }
    await rendered.settle();
    assert.equal(nodes(rendered.tree, (node) => node?.props?.['data-capability'] === 'ai-chat').length, 0);
    assert.equal(nodes(rendered.tree, (node) => node?.type === 'a' && node.props?.href?.startsWith('https://wa.me/')).length, 1);
  }
});

const expensasPath = fileURLToPath(new URL('../src/pages/Expensas.jsx', import.meta.url));

async function renderResidentExpenses(mercadoPago, { capabilityServiceOverride = null } = {}) {
  const hooks = hooksHarness();
  const paymentCalls = [];
  const opened = [];
  const output = await build({
    entryPoints: [expensasPath], bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic', write: false,
    plugins: [{
      name: 'expense-test-boundaries',
      setup(api) {
        const boundaries = [
          [/^react$/, 'react'], [/^react\/jsx-runtime$/, 'jsx-runtime'],
          [/services\/expensas/, 'expenses'], [/services\/payments/, 'payments'],
          [/services\/protectedUploads/, 'uploads'], [/services\/capabilities/, 'capabilities'],
          [/context\/AuthContext/, 'auth'], [/CreateExpensa/, 'create'], [/components\/Spinner/, 'spinner'],
          [/services\/errors/, 'errors'],
        ];
        for (const [filter, path] of boundaries) api.onResolve({ filter }, () => ({ path, namespace: 'test' }));
        api.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
          contents: `module.exports = globalThis.__boundaries[${JSON.stringify(path)}];`, loader: 'js',
        }));
      },
    }],
  });
  const jsx = (type, props, key) => typeof type === 'function' ? type(props || {}) : ({ type, key, props: props || {} });
  const boundaries = {
    react: hooks.api,
    'jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    expenses: { expenseService: { listMy: async () => ({ data: [{ id: 4, description: 'Agosto', status: 'pending', amount_owed: 100 }] }) } },
    payments: { paymentService: { async createPreference(id) { paymentCalls.push(id); return { data: { init_point: 'https://pay.example.test/4' } }; } } },
    uploads: { downloadProtectedUpload: async () => {} },
    capabilities: {
      capabilityService: capabilityServiceOverride || {
        async get() { return { aiAssistant: false, mercadoPago, automaticWhatsApp: false }; },
      },
    },
    auth: { useAuth: () => ({ user: { role: 'residente' } }) },
    create: { default: () => null }, spinner: { default: () => null },
    errors: { getErrorMessage: (_error, fallback) => fallback },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    __boundaries: boundaries, globalThis: null, module, exports: module.exports, console,
    Blob, File, FormData, setTimeout, window: { open: (...args) => opened.push(args) },
  });
  context.globalThis = context;
  vm.runInContext(output.outputFiles[0].text, context, { filename: 'Expensas.bundle.cjs' });
  const Component = module.exports.default;
  let tree;
  const render = () => { hooks.begin(); tree = Component({}); return tree; };
  render();
  await settle(render, () => hooks.flush());
  return {
    get tree() { return tree; },
    paymentCalls,
    opened,
    render,
    settle: () => settle(render, () => hooks.flush()),
  };
}

test('Expensas stays fail-closed while capability reads are pending and after malformed or rejected settlement', async () => {
  for (const outcome of ['malformed', 'rejected']) {
    const pending = deferred();
    const service = capabilityModule.createCapabilityService({ get: () => pending.promise });
    const rendered = await renderResidentExpenses(false, { capabilityServiceOverride: service });
    assert.match(textContent(rendered.tree), /Comprobante de pago/);
    assert.doesNotMatch(textContent(rendered.tree), /Pagar con MP/);

    if (outcome === 'malformed') {
      pending.resolve({ data: { capabilities: { aiAssistant: false, mercadoPago: 'true' } } });
    } else {
      pending.reject(new Error('synthetic health failure'));
    }
    await rendered.settle();
    assert.match(textContent(rendered.tree), /Comprobante de pago/);
    assert.doesNotMatch(textContent(rendered.tree), /Pagar con MP/);
    assert.deepEqual(rendered.paymentCalls, []);
  }
});

test('Expensas keeps manual proof primary and renders a working MP action only when enabled', async () => {
  const disabled = await renderResidentExpenses(false);
  assert.match(textContent(disabled.tree), /Comprobante de pago/);
  assert.doesNotMatch(textContent(disabled.tree), /Pagar con MP/);

  const enabled = await renderResidentExpenses(true);
  assert.match(textContent(enabled.tree), /Comprobante de pago/);
  const pay = nodes(enabled.tree, (node) => node?.type === 'button' && textContent(node) === 'Pagar con MP')[0];
  assert.ok(pay);
  await pay.props.onClick();
  assert.deepEqual(enabled.paymentCalls, [4]);
  assert.deepEqual(enabled.opened, [['https://pay.example.test/4', '_blank']]);
});
