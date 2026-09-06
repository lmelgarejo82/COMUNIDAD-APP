// Optional real-browser layout gate. Uses an explicitly supplied existing
// Playwright installation and browser; does not download either dependency.
// node test/accessFiltersLayout.qa.cjs <playwright-module> <chrome-executable>
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

(async () => {
  assert.ok(process.argv[2] && process.argv[3], 'Supply existing Playwright and Chrome paths');
  const compiled = buildSync({
    entryPoints: [path.join(__dirname, '../src/components/access/AccessFilters.jsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require });
  const markup = renderToStaticMarkup(React.createElement(module.exports.default, {
    filters: {}, onChange() {}, onClear() {},
  }));
  const browser = await require(process.argv[2]).chromium.launch({ executablePath: process.argv[3], headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:20px;font-family:Arial}main{display:grid}</style></head><body><main>${markup}</main></body></html>`);
      const measured = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(measured.scroll <= width, `Access filters overflow ${width}px viewport: ${measured.scroll}px`);
      for (const control of await page.locator('input,select,button').all()) {
        const box = await control.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, 'Every filter control remains reachable in the viewport');
      }
      console.log(`Access filters layout ${width}px PASS`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
