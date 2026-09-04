const test = require('node:test');
const assert = require('node:assert/strict');

function routeHandlers(router, path, method) {
  const layer = router.stack.find(candidate => (
    candidate.route?.path === path && candidate.route?.methods?.[method]
  ));
  assert.ok(layer, `${method.toUpperCase()} ${path} route not found`);
  return layer.route.stack.map(handler => handler.handle.name);
}

test('announcement read receipt establishes community context before controller', () => {
  const router = require('../routes/announcements');
  const handlers = routeHandlers(router, '/:id/read', 'put');

  assert.ok(handlers.includes('setCommunity'));
  assert.equal(handlers.indexOf('setCommunity'), handlers.length - 2);
});

test('my bookings establishes community context before controller', () => {
  const router = require('../routes/bookings');
  const handlers = routeHandlers(router, '/my', 'get');

  assert.ok(handlers.includes('setCommunity'));
  assert.equal(handlers.indexOf('setCommunity'), handlers.length - 2);
});
