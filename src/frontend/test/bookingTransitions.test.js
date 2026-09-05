import test from 'node:test';
import assert from 'node:assert/strict';
let transitions = {};
try { transitions = await import('../src/utils/bookingTransitions.js'); } catch {}
for (const [status, expected] of [['pending', ['active', 'cancelled']], ['active', ['finished', 'cancelled']], ['finished', []], ['cancelled', []], ['unknown', []]]) {
  test(`booking ${status} exposes only allowed explicit actions`, () => {
    assert.equal(typeof transitions.getBookingActions, 'function');
    assert.deepEqual(transitions.getBookingActions(status), expected);
  });
}
