const test = require('node:test');
const assert = require('node:assert/strict');

const hierarchyPath = require.resolve('../models/Hierarchy');
const dbPath = require.resolve('../db');
const cachePath = require.resolve('../cache');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function loadHierarchy(onQuery) {
  delete require.cache[hierarchyPath];
  mockModule(cachePath, { cacheOrFetch: async (key, ttl, fn) => fn(), CACHE_TTL: { LONG: 1 } });
  mockModule(dbPath, {
    pool: {
      async query(sql, params) {
        return onQuery(sql, params);
      },
    },
  });
  return require('../models/Hierarchy').Hierarchy;
}

test('Hierarchy.searchUnits filters by community and caps limit', async () => {
  let receivedSql = '';
  let receivedParams = null;
  const Hierarchy = loadHierarchy((sql, params) => {
    receivedSql = sql;
    receivedParams = params;
    return { rows: [] };
  });

  await Hierarchy.searchUnits(1, { q: 'A1B', complexId: 10, limit: 50 });

  assert.match(receivedSql, /cx\.community_id = \$1/);
  assert.match(receivedSql, /cx\.id = \$2/);
  assert.deepEqual(receivedParams, [1, 10, '%A1B%', 20]);
});

test('Hierarchy.searchUnits includes normalized building floor unit route search', async () => {
  let receivedSql = '';
  const Hierarchy = loadHierarchy((sql) => {
    receivedSql = sql;
    return { rows: [{ unit_id: 2, unit_code: 'A1B', display_path: 'Torre A · Piso 1 · Unidad A1B' }] };
  });

  const rows = await Hierarchy.searchUnits(1, { q: 'Torre A 1', complexId: 10, limit: 5 });

  assert.match(receivedSql, /CONCAT_WS\(' ', b\.name, f\.number, u\.unit_code, cx\.name\) ILIKE/);
  assert.equal(rows[0].unit_code, 'A1B');
});

test('Hierarchy.reorganizeUnits scopes both destination lookup and source mutation', async () => {
  const calls = [];
  const Hierarchy = loadHierarchy((sql, params) => {
    calls.push({ sql, params });
    if (/FROM floors f/.test(sql)) {
      return {
        rows: [{
          floor_id: 10,
          building_id: 20,
          complex_id: 70,
          building_name: 'Torre A',
          floor_number: 1,
        }],
      };
    }
    return { rows: [{ id: 1, floor_id: 10 }] };
  });

  const result = await Hierarchy.reorganizeUnits(7, [{ unit_id: 1, new_floor_id: 10 }]);

  assert.equal(result.updated.length, 1);
  assert.match(calls[0].sql, /cx\.community_id = \$2/);
  assert.deepEqual(calls[0].params, [10, 7]);
  assert.match(calls[1].sql, /current_complex\.community_id = \$3/);
  assert.match(calls[1].sql, /desired_complex\.community_id = \$3/);
  assert.deepEqual(calls[1].params, [1, 10, 7, null]);
});

test('Hierarchy.reorganizeUnits supports the existing reorder payload with community scope', async () => {
  const calls = [];
  const Hierarchy = loadHierarchy((sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 1, floor_id: 10, sort_order: 2 }] };
  });

  const result = await Hierarchy.reorganizeUnits(7, [{ id: 1, sort_order: 2 }]);

  assert.equal(result.updated[0].sort_order, 2);
  assert.match(calls[0].sql, /SET sort_order = \$2/);
  assert.match(calls[0].sql, /current_complex\.community_id = \$3/);
  assert.deepEqual(calls[0].params, [1, 2, 7]);
});
