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
  onSearchUnits = () => {},
  searchUnitsResult = [],
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
      async searchUnits(communityId, filters) {
        onSearchUnits(communityId, filters);
        return searchUnitsResult;
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

test('admin complexes endpoint returns allowed complexes with community scope metadata', async () => {
  const { getAdminComplexes } = loadController({
    adminComplexes: [
      { id: 10, name: 'Complejo A', community_id: 1, community_name: 'Consorcio Norte', organization_id: 100, organization_name: 'Grupo Norte' },
      { id: 20, name: 'Complejo B', community_id: 2, community_name: 'Consorcio Sur', organization_id: 200, organization_name: 'Grupo Sur' },
    ],
  });
  const res = createResponse();

  await getAdminComplexes({ user: { id: 5, role: 'admin' } }, res);

  assert.deepEqual(res.body, [
    { id: 10, name: 'Complejo A', community_id: 1, community_name: 'Consorcio Norte', organization_id: 100, organization_name: 'Grupo Norte' },
    { id: 20, name: 'Complejo B', community_id: 2, community_name: 'Consorcio Sur', organization_id: 200, organization_name: 'Grupo Sur' },
  ]);
});

test('unit autocomplete searches using validated request community context', async () => {
  let receivedCommunityId = null;
  let receivedFilters = null;
  const { searchUnits } = loadController({
    complexes: [{ id: 10, community_id: 1 }],
    searchUnitsResult: [{ unit_id: 1, unit_code: '01A', display_path: 'Torre A · Piso 1 · Unidad 01A' }],
    onSearchUnits: (communityId, filters) => {
      receivedCommunityId = communityId;
      receivedFilters = filters;
    },
  });
  const res = createResponse();

  await searchUnits({ user: { id: 5, role: 'admin' }, communityId: 1, complexId: 10, query: { q: '01A' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(receivedCommunityId, 1);
  assert.equal(receivedFilters.q, '01A');
  assert.equal(receivedFilters.complexId, 10);
  assert.equal(res.body.data[0].unit_code, '01A');
});

test('unit autocomplete rejects a complex outside validated community', async () => {
  let searched = false;
  const { searchUnits } = loadController({
    complexes: [{ id: 10, community_id: 1 }],
    onSearchUnits: () => { searched = true; },
  });
  const res = createResponse();

  await searchUnits({ user: { id: 5, role: 'admin' }, communityId: 1, query: { complex: '99', q: 'A' } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(searched, false);
  assert.deepEqual(res.body, { error: 'El complejo no pertenece a tu comunidad' });
});

test('unit autocomplete can return matches by unit code and route metadata', async () => {
  const { searchUnits } = loadController({
    complexes: [{ id: 10, community_id: 1 }],
    searchUnitsResult: [
      {
        unit_id: 7,
        unit_code: '2B',
        unit_label: '2B',
        floor_name: null,
        building_name: 'Torre A',
        complex_id: 10,
        complex_name: 'Complejo Norte',
        display_path: 'Torre A · Piso 2 · Unidad 2B',
      },
    ],
  });
  const res = createResponse();

  await searchUnits({ user: { id: 5, role: 'admin' }, communityId: 1, query: { q: 'Torre A 2' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].unit_id, 7);
  assert.equal(res.body.data[0].display_path, 'Torre A · Piso 2 · Unidad 2B');
});

test('unit autocomplete forwards requested limit with safe community scope', async () => {
  let receivedFilters = null;
  const { searchUnits } = loadController({
    complexes: [{ id: 10, community_id: 1 }],
    onSearchUnits: (communityId, filters) => {
      assert.equal(communityId, 1);
      receivedFilters = filters;
    },
  });
  const res = createResponse();

  await searchUnits({ user: { id: 5, role: 'admin' }, communityId: 1, complexId: 10, query: { limit: '50' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(receivedFilters.limit, '50');
  assert.equal(receivedFilters.complexId, 10);
});
