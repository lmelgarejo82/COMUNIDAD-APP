import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const componentUrl = new URL('../src/pages/ResetPassword.jsx', import.meta.url);
const componentPath = fileURLToPath(componentUrl);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fragmentWindow(initialToken = 'credential-a') {
  const listeners = new Set();
  const replacements = [];
  const windowLike = {
    location: {
      hash: `#token=${encodeURIComponent(initialToken)}`,
      pathname: '/reset-password',
      search: '',
    },
    history: {
      replaceState: (...args) => {
        replacements.push(args);
        windowLike.location.hash = '';
      },
    },
    addEventListener: (type, listener) => {
      if (type === 'hashchange') listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'hashchange') listeners.delete(listener);
    },
    get localStorage() { assert.fail('reset flow must not access localStorage'); },
    get sessionStorage() { assert.fail('reset flow must not access sessionStorage'); },
  };

  return {
    replacements,
    windowLike,
    replaceToken(token) {
      windowLike.location.hash = `#token=${encodeURIComponent(token)}`;
      for (const listener of [...listeners]) listener(new Event('hashchange'));
    },
  };
}

function createHooks() {
  const slots = [];
  const effects = [];
  const writes = [];
  let cursor = 0;
  let mounted = true;

  return {
    api: {
      useLayoutEffect(effect, dependencies) {
        const slot = cursor;
        cursor += 1;
        const previous = effects[slot];
        const changed = !previous || !dependencies || dependencies.some((value, index) => value !== previous.dependencies[index]);
        if (changed) effects[slot] = { dependencies, effect, cleanup: previous?.cleanup, pending: true };
      },
      useRef(initialValue) {
        const slot = cursor;
        cursor += 1;
        if (!(slot in slots)) slots[slot] = { current: initialValue };
        return slots[slot];
      },
      useState(initialValue) {
        const slot = cursor;
        cursor += 1;
        if (!(slot in slots)) slots[slot] = typeof initialValue === 'function' ? initialValue() : initialValue;
        const setValue = (nextValue) => {
          writes.push({ mounted, slot });
          slots[slot] = typeof nextValue === 'function' ? nextValue(slots[slot]) : nextValue;
        };
        return [slots[slot], setValue];
      },
    },
    beginRender() {
      cursor = 0;
    },
    flushEffects() {
      for (const entry of effects) {
        if (!entry?.pending) continue;
        entry.cleanup?.();
        entry.cleanup = entry.effect();
        entry.pending = false;
      }
    },
    unmount() {
      mounted = false;
      for (const entry of effects) entry?.cleanup?.();
    },
    writes,
  };
}

function childrenOf(node) {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  return Array.isArray(children) ? children : children == null ? [] : [children];
}

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of childrenOf(node)) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

let bundledComponent;
async function componentCode() {
  if (!bundledComponent) {
    bundledComponent = build({
      entryPoints: [componentPath],
      bundle: true,
      format: 'cjs',
      jsx: 'automatic',
      platform: 'node',
      write: false,
      plugins: [{
        name: 'reset-password-test-boundaries',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'test-boundary' }));
          buildApi.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx-runtime', namespace: 'test-boundary' }));
          buildApi.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'router', namespace: 'test-boundary' }));
          buildApi.onResolve({ filter: /services\/accountRecovery$/ }, () => ({ path: 'recovery', namespace: 'test-boundary' }));
          buildApi.onLoad({ filter: /.*/, namespace: 'test-boundary' }, ({ path }) => ({
            contents: `module.exports = globalThis.__testBoundaries[${JSON.stringify(path)}];`,
            loader: 'js',
          }));
        },
      }],
    }).then(result => result.outputFiles[0].text);
  }
  return bundledComponent;
}

async function renderResetPassword(requests) {
  const browser = fragmentWindow();
  const hooks = createHooks();
  const navigations = [];
  const resetCalls = [];
  const location = { pathname: '/reset-password' };
  const jsx = (type, props, key) => ({ type, key, props: props || {} });
  const boundaries = {
    react: hooks.api,
    'jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    router: {
      Link: ({ children, ...props }) => jsx('a', { ...props, children }),
      useLocation: () => location,
      useNavigate: () => (...args) => navigations.push(args),
    },
    recovery: {
      reset: (token, password) => {
        resetCalls.push({ token, password });
        return requests[resetCalls.length - 1].promise;
      },
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    Event,
    URLSearchParams,
    __testBoundaries: boundaries,
    console,
    globalThis: null,
    module,
    exports: module.exports,
    window: browser.windowLike,
  });
  context.globalThis = context;
  vm.runInContext(await componentCode(), context, { filename: 'ResetPassword.bundle.cjs' });
  const Component = module.exports.default;
  let tree;

  function render() {
    hooks.beginRender();
    tree = Component();
    hooks.flushEffects();
    return tree;
  }

  function input(id) {
    return findNode(tree, node => node?.type === 'input' && node.props.id === id);
  }

  function fillPasswords(value = 'Secure123!') {
    input('reset-password').props.onChange({ target: { value } });
    input('reset-confirmation').props.onChange({ target: { value } });
    render();
  }

  function submit() {
    const form = findNode(tree, node => node?.type === 'form');
    return form.props.onSubmit({ preventDefault() {} });
  }

  render();
  return {
    browser,
    fillPasswords,
    hooks,
    navigations,
    render,
    requests,
    resetCalls,
    submit,
    tree: () => tree,
  };
}

test('an older reset success cannot erase a replacement credential or navigate', async () => {
  const requestA = deferred();
  const harness = await renderResetPassword([requestA]);
  harness.fillPasswords();
  const submissionA = harness.submit();

  harness.browser.replaceToken('credential-b');
  harness.render();
  requestA.resolve({ status: 204 });
  await submissionA;
  harness.render();

  const button = findNode(harness.tree(), node => node?.type === 'button');
  assert.equal(button.props.disabled, false, 'replacement credential must remain usable');
  assert.deepEqual(harness.navigations, []);
  assert.equal(harness.browser.windowLike.location.hash, '');
  assert.equal(harness.browser.replacements.length, 2);
});

test('an older reset failure cannot publish an error against a replacement credential', async () => {
  const requestA = deferred();
  const harness = await renderResetPassword([requestA]);
  harness.fillPasswords();
  const submissionA = harness.submit();

  harness.browser.replaceToken('credential-b');
  harness.render();
  requestA.reject({ response: { status: 400 } });
  await submissionA;
  harness.render();

  assert.equal(findNode(harness.tree(), node => node?.props?.role === 'alert'), null);
  assert.deepEqual(harness.navigations, []);
});

test('an older reset finally cannot clear the current request loading state', async () => {
  const requestA = deferred();
  const requestB = deferred();
  const harness = await renderResetPassword([requestA, requestB]);
  harness.fillPasswords();
  const submissionA = harness.submit();
  harness.render();

  harness.browser.replaceToken('credential-b');
  harness.render();
  harness.fillPasswords('NewSecure123!');
  const submissionB = harness.submit();
  harness.render();

  requestA.resolve({ status: 204 });
  await submissionA;
  harness.render();
  const button = findNode(harness.tree(), node => node?.type === 'button');
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.children, 'Actualizando...');

  requestB.resolve({ status: 204 });
  await submissionB;
});

test('the current reset request still posts the current credential and redirects with fixed state', async () => {
  const request = deferred();
  const harness = await renderResetPassword([request]);
  harness.fillPasswords();
  const submission = harness.submit();
  request.resolve({ status: 204 });
  await submission;

  assert.deepEqual(harness.resetCalls, [{ token: 'credential-a', password: 'Secure123!' }]);
  assert.equal(harness.navigations.length, 1);
  assert.equal(harness.navigations[0][0], '/login');
  assert.equal(harness.navigations[0][1].replace, true);
  assert.equal(harness.navigations[0][1].state.passwordReset, true);
});

test('unmount invalidates a pending reset before any later writes or navigation', async () => {
  const request = deferred();
  const harness = await renderResetPassword([request]);
  harness.fillPasswords();
  const submission = harness.submit();
  const writesBeforeUnmount = harness.hooks.writes.length;
  harness.hooks.unmount();

  request.resolve({ status: 204 });
  await submission;

  assert.equal(harness.hooks.writes.length, writesBeforeUnmount);
  assert.deepEqual(harness.navigations, []);
});
