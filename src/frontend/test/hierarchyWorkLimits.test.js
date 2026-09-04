import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIERARCHY_WORK_LIMITS,
  parseHierarchyCount,
} from '../src/utils/hierarchyWorkLimits.js';

test('frontend hierarchy counts accept strict numeric strings through the established maximum', () => {
  assert.equal(parseHierarchyCount('6', {
    label: 'Cantidad de lotes',
    max: HIERARCHY_WORK_LIMITS.totalLots,
  }), 6);
  assert.equal(parseHierarchyCount(200, {
    label: 'Cantidad de lotes',
    max: HIERARCHY_WORK_LIMITS.totalLots,
  }), 200);
});

test('frontend hierarchy counts reject values that could exceed or bypass the displayed constraints', () => {
  for (const value of [201, 1_000_000_000, 0, -1, 2.5, '2.5', '10x', 'many', null, undefined]) {
    assert.throws(
      () => parseHierarchyCount(value, {
        label: 'Cantidad de lotes',
        max: HIERARCHY_WORK_LIMITS.totalLots,
      }),
      { message: 'Cantidad de lotes debe ser un entero entre 1 y 200' }
    );
  }
});
