import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
export function nodes(node, predicate) {
  const children = Array.isArray(node) ? node : [node?.props?.children].flat();
  return [...(predicate(node) ? [node] : []), ...children.filter(x => x != null).flatMap(x => nodes(x, predicate))];
}
export function content(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (Array.isArray(node) ? node : [node?.props?.children].flat()).filter(x => x != null).map(content).join('');
}
export async function renderPage(name, boundaries) {
  const slots = [], effects = [], writes = [];
  let cursor = 0, mounted = true;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { writes.push(mounted); slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((x, n) => x !== slots[i].deps[n])) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!effects[i] || deps.some((x, n) => x !== effects[i].deps[n])) effects[i] = { fn, deps, pending: true, cleanup: effects[i]?.cleanup };
    },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const mocks = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, ...Object.fromEntries(Object.entries(boundaries).map(([key, value]) => [key, value.default ? { __esModule: true, ...value } : value])) };
  const result = await build({ entryPoints: [fileURLToPath(new URL(`../../src/pages/${name}.jsx`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [{ name: 'page-boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const match = Object.keys(mocks).find(key => args.path === key || args.path.endsWith(key));
      if (match) return { path: match, namespace: 'boundary' };
      if (args.path.endsWith('.css')) return { path: args.path, namespace: 'empty' };
    });
    b.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: Object.keys(mocks[args.path]).filter(key => key !== '__esModule').map(key => key === 'default' ? `export default mocks[${JSON.stringify(args.path)}].default;` : `export const ${key} = mocks[${JSON.stringify(args.path)}][${JSON.stringify(key)}];`).join('\n') }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
  } }] });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, mocks, console, FormData, window: { confirm: () => false } });
  let tree;
  const render = () => {
    cursor = 0; tree = module.exports.default();
    for (const e of effects) if (e?.pending) { e.pending = false; e.cleanup?.(); e.cleanup = e.fn(); }
    return tree;
  };
  render();
  return { render, tree: () => tree, writes, unmount() { mounted = false; for (const e of effects) e?.cleanup?.(); }, async settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); return render(); } };
}
