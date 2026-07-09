const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const modelPath = require.resolve('../models/AdminComplex');

function loadModel(onQuery) {
  delete require.cache[modelPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: {
        async query(sql, params) {
          return onQuery(String(sql), params);
        },
      },
    },
  };
  return require('../models/AdminComplex').AdminComplex;
}

test('findComplexesByAdmin returns organization and community metadata without broad organization access', async () => {
  let receivedSql = '';
  let receivedParams = null;
  const AdminComplex = loadModel((sql, params) => {
    receivedSql = sql;
    receivedParams = params;
    return {
      rows: [{
        id: 2,
        name: 'Country Los Olivos',
        community_id: 20,
        community_name: 'Consorcio Olivos',
        organization_id: 5,
        organization_name: 'Administradora Norte',
      }],
    };
  });

  const rows = await AdminComplex.findComplexesByAdmin(7);

  assert.deepEqual(receivedParams, [7]);
  assert.match(receivedSql, /JOIN admin_complexes ac ON ac\.complex_id = cx\.id/);
  assert.match(receivedSql, /LEFT JOIN organizations o ON o\.id = c\.organization_id/);
  assert.doesNotMatch(receivedSql, /WHERE\s+o\.id/i);
  assert.deepEqual(rows, [{
    id: 2,
    name: 'Country Los Olivos',
    community_id: 20,
    community_name: 'Consorcio Olivos',
    organization_id: 5,
    organization_name: 'Administradora Norte',
  }]);
});
