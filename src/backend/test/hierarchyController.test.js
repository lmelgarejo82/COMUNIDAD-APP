const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/hierarchyController');
const hierarchyPath = require.resolve('../models/Hierarchy');
const adminComplexPath = require.resolve('../models/AdminComplex');
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

function loadController({
  complexes = [],
  adminComplexes = [],
  trees = {},
  verifyAdminAccess = async () => false,
  onGetUnitTree = () => {},
} = {}) {
  delete require.cache[controllerPath];

  mockModule(hierarchyPath, {
    Hierarchy: {
      async getComplexes(communityId) {
        return complexes.filter(c => !communityId || c.community_id === communityId);
      },
      async getUnitTree(complexId) {
        onGetUnitTree(complexId);
        return trees[complexId] || null;
      },
    },
  });

  mockModule(adminComplexPath, {
    AdminComplex: {
      async findComplexesByAdmin() {
        return adminComplexes;
      },
      verifyAdminAccess,
    },
  });

  mockModule(dbPath, {
    pool: {
      async query() {
        throw new Error('unexpected db query');
      },
    },
  });

  mockModule(cachePath, { invalidatePattern: async () => {} });

  return require('../controllers/hierarchyController');
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('hierarchy tree rejects legacy complexId outside validated community context', async () => {
  let treeRequested = false;
  const { tree } = loadController({
    complexes: [{ id: 10, community_id: 1 }],
    onGetUnitTree: () => { treeRequested = true; },
  });
  const res = createResponse();

  await tree({ user: { id: 5, role: 'admin' }, communityId: 1, query: { complexId: '99' } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(treeRequested, false);
  assert.deepEqual(res.body, { error: 'No tenés acceso a este complejo' });
});

test('hierarchy tree loads req.complexId after validating community ownership', async () => {
  let verifiedLegacyAccess = false;
  const { tree } = loadController({
    complexes: [{ id: 10, community_id: 1 }],
    trees: { 10: { id: 10, name: 'Complejo A', buildings: [] } },
    verifyAdminAccess: async () => {
      verifiedLegacyAccess = true;
      return false;
    },
  });
  const res = createResponse();

  await tree({ user: { id: 5, role: 'admin' }, communityId: 1, complexId: 10, query: {} }, res);

  assert.equal(verifiedLegacyAccess, false);
  assert.deepEqual(res.body, [{ id: 10, name: 'Complejo A', buildings: [] }]);
});

test('hierarchy tree for admin lists only complexes from validated request community', async () => {
  const requestedTrees = [];
  const { tree } = loadController({
    adminComplexes: [
      { id: 10, community_id: 1, name: 'Complejo A' },
      { id: 20, community_id: 2, name: 'Complejo B' },
      { id: 30, community_id: 1, name: 'Complejo C' },
    ],
    trees: {
      10: { id: 10, name: 'Complejo A' },
      30: { id: 30, name: 'Complejo C' },
    },
    onGetUnitTree: (complexId) => requestedTrees.push(complexId),
  });
  const res = createResponse();

  await tree({ user: { id: 5, role: 'admin' }, communityId: 1, query: {} }, res);

  assert.deepEqual(requestedTrees, [10, 30]);
  assert.deepEqual(res.body, [
    { id: 10, name: 'Complejo A' },
    { id: 30, name: 'Complejo C' },
  ]);
});
