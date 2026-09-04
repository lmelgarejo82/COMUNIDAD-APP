const test = require('node:test');
const assert = require('node:assert/strict');

test('static unit reorganization route is registered before the unit ID route', () => {
  const router = require('../routes/hierarchy');
  const routes = router.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

  assert.ok(routes.indexOf('PUT /units/reorganize') < routes.indexOf('PUT /units/:id'));
});
