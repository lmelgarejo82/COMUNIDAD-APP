// Optional actual-component browser gate; supplied installed tooling only.
// node test/headerLayout.qa.cjs <playwright-module> <chrome-executable> [screenshot-directory]
const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');

(async () => {
  assert.ok(process.argv[2] && process.argv[3], 'Supply existing Playwright and Chrome paths');
  const compiled = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom'; import Layout from './src/components/Layout.jsx'; createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/invite']}><Layout/></MemoryRouter>);`, resolveDir: path.join(__dirname, '..'), loader: 'jsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-layout-data', setup(b) {
      b.onResolve({ filter: /context\/(AuthContext|CommunityContext)$|services\/(comunicacion|capabilities)$/ }, a => ({ path: a.path, namespace: 'layout-data' }));
      b.onLoad({ filter: /.*/, namespace: 'layout-data' }, a => ({ contents:
        a.path.endsWith('AuthContext') ? `export const useAuth=()=>({user:{email:'b36qa-2fd1d8cb97886ac6-0-admin@example.test',role:'admin'},logout:()=>window.__logout=true});` :
        a.path.endsWith('CommunityContext') ? `export const useCommunity=()=>({complexes:[{id:1,name:'b36qa-2fd1d8cb97886ac6-complejo',community_name:'b36qa-2fd1d8cb97886ac6-0',organization_name:'b36qa-2fd1d8cb97886ac6-0'}],selectedId:1,setSelectedId:()=>window.__scope=true,fetchComplexes:()=>{}});` :
        a.path.endsWith('comunicacion') ? `export const notificationService={count:async()=>({data:{count:0}}),list:async()=>({data:[]})};` : `export const capabilityService={get:async()=>({})};`, loader: 'js' }));
    } }],
  });
  const browser = await require(process.argv[2]).chromium.launch({ executablePath: process.argv[3], headless: true });
  try {
    const errors = [];
    for (const width of [1366, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.setContent('<html><head><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}</style></head><body><div id="root"></div></body></html>');
      await page.addScriptTag({ content: compiled.outputFiles[0].text });
      await page.locator('header').waitFor();
      if (process.argv[4]) await page.screenshot({ path: path.join(process.argv[4], `task-6-header-${width}.png`) });
      const geometry = await page.evaluate(() => {
        const h = document.querySelector('header').getBoundingClientRect();
        const nodes = [...document.querySelectorAll('header a,header button,header strong,header nav+div>div,header nav+div>span')];
        return { scroll: document.documentElement.scrollWidth, controls: nodes.map(e => {
          const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { label: e.textContent, contained: r.x >= 0 && r.right <= innerWidth && r.top >= h.top && r.bottom <= h.bottom, hit: e === hit || e.contains(hit), rect: { x:r.x,y:r.y,right:r.right,bottom:r.bottom } };
        }) };
      });
      assert.equal(geometry.scroll, width);
      for (const c of geometry.controls) assert.ok(c.contained && c.hit, `${width}px header control escapes or overlaps: ${c.label} ${JSON.stringify(c.rect)}`);
      for (let i = 0; i < geometry.controls.length; i++) for (let j = i + 1; j < geometry.controls.length; j++) {
        const a = geometry.controls[i].rect, b = geometry.controls[j].rect;
        assert.ok(Math.min(a.right, b.right) - Math.max(a.x, b.x) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) <= 1, 'Header controls must not overlap');
      }
      if (width === 390) await page.getByRole('button', { name: '☰', exact: true }).click();
      for (const link of await page.getByRole('link').all()) {
        const reachable = await link.evaluate(e => { const r = e.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
        assert.ok(reachable, 'Navigation link remains reachable');
      }
      await page.getByRole('link', { name: 'Expensas', exact: true }).click();
      if (width === 1366) await page.waitForFunction(() => document.querySelector('a[href="/expensas"]').style.fontWeight === '700');
      if (width === 390) await page.getByRole('button', { name: '☰', exact: true }).click();
      await page.getByRole('button', { name: /Alcance/ }).click();
      await page.getByPlaceholder('Buscar organización, comunidad o complejo').waitFor();
      await page.getByRole('button', { name: 'b36qa-2fd1d8cb97886ac6-complejo Complejo', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__scope), true);
      await page.locator('header').getByText('🔔', { exact: true }).click();
      await page.getByText('Sin notificaciones', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Salir', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__logout), true);
      assert.deepEqual(errors, []);
      console.log(`Actual header ${width}px geometry, scope, bell, logout PASS`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
