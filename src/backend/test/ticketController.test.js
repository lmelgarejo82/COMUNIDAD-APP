const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/ticketController');
const ticketPath = require.resolve('../models/Ticket');
const userPath = require.resolve('../models/User');
const notificationPath = require.resolve('../models/Notification');
const cachePath = require.resolve('../cache');
const dbPath = require.resolve('../db');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function clearController() {
  [controllerPath, ticketPath, userPath, notificationPath, cachePath, dbPath].forEach(path => {
    delete require.cache[path];
  });
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

function baseMocks({ user = { id: 10, community_id: 1, unit_number: 'A1B' }, ticketImpl = {} } = {}) {
  mockModule(userPath, {
    User: {
      async findById() {
        return user;
      },
    },
  });
  mockModule(ticketPath, {
    Ticket: {
      async create(payload) {
        return { id: 1, status: 'sent', ...payload };
      },
      async findByCommunity() {
        return { data: [], total: 0 };
      },
      async findByUser() {
        return { data: [], total: 0 };
      },
      async findById() {
        return null;
      },
      async updateStatus(id, status) {
        return { id, status };
      },
      ...ticketImpl,
    },
  });
  mockModule(notificationPath, {
    Notification: {
      async create() {
        return {};
      },
    },
  });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(dbPath, {
    pool: {
      async query() {
        return { rows: [] };
      },
    },
  });
}

test('resident creates ticket in validated community with workflow fields', async () => {
  clearController();
  let received = null;
  baseMocks({
    ticketImpl: {
      async create(payload) {
        received = payload;
        return { id: 33, status: 'sent', ...payload };
      },
    },
  });

  const { create } = require('../controllers/ticketController');
  const res = createResponse();

  await create({
    user: { id: 10, role: 'residente' },
    communityId: 1,
    body: {
      title: 'Pérdida de agua',
      description: 'Hay agua en el pasillo del piso 2',
      category: 'maintenance',
      priority: 'high',
      location_label: 'Piso 2',
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(received.community_id, 1);
  assert.equal(received.user_id, 10);
  assert.equal(received.unit_number, 'A1B');
  assert.equal(received.category, 'maintenance');
  assert.equal(received.priority, 'high');
  assert.equal(received.location_label, 'Piso 2');
});

test('resident cannot create ticket outside own community context', async () => {
  clearController();
  let created = false;
  baseMocks({
    user: { id: 10, community_id: 2, unit_number: 'A1B' },
    ticketImpl: {
      async create() {
        created = true;
      },
    },
  });

  const { create } = require('../controllers/ticketController');
  const res = createResponse();

  await create({
    user: { id: 10, role: 'residente' },
    communityId: 1,
    body: { title: 'Ruido', description: 'Ruido de madrugada', category: 'coexistence', priority: 'medium' },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(created, false);
});

test('ticket creation validates required fields', async () => {
  clearController();
  baseMocks();

  const { create } = require('../controllers/ticketController');
  const res = createResponse();

  await create({
    user: { id: 10, role: 'residente' },
    communityId: 1,
    body: { title: 'Ascensor sin funcionar', category: 'maintenance', priority: 'urgent' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'description es requerido');
});

test('resident ticket listing uses filters within validated community', async () => {
  clearController();
  let received = null;
  baseMocks({
    ticketImpl: {
      async findByUser(userId, communityId, filters) {
        received = { userId, communityId, filters };
        return { data: [], total: 0 };
      },
    },
  });

  const { listMy } = require('../controllers/ticketController');
  const res = createResponse();

  await listMy({
    user: { id: 10, role: 'residente' },
    communityId: 1,
    query: { status: 'sent', category: 'security', priority: 'urgent' },
  }, res);

  assert.deepEqual(received, {
    userId: 10,
    communityId: 1,
    filters: { page: undefined, limit: undefined, status: 'sent', category: 'security', priority: 'urgent' },
  });
});

test('admin listing uses filters within validated community', async () => {
  clearController();
  let received = null;
  baseMocks({
    ticketImpl: {
      async findByCommunity(communityId, filters) {
        received = { communityId, filters };
        return { data: [], total: 0 };
      },
    },
  });

  const { listAll } = require('../controllers/ticketController');
  const res = createResponse();

  await listAll({
    user: { id: 1, role: 'admin' },
    communityId: 7,
    query: { status: 'in_review', category: 'cleaning', priority: 'low' },
  }, res);

  assert.deepEqual(received, {
    communityId: 7,
    filters: { page: undefined, limit: undefined, status: 'in_review', category: 'cleaning', priority: 'low' },
  });
});

test('admin cannot update status for ticket from another community', async () => {
  clearController();
  baseMocks({
    ticketImpl: {
      async findById() {
        return { id: 44, community_id: 2, user_id: 10, title: 'Otro ticket', status: 'sent' };
      },
    },
  });

  const { updateStatus } = require('../controllers/ticketController');
  const res = createResponse();

  await updateStatus({
    user: { id: 1, role: 'admin' },
    communityId: 1,
    params: { id: 44 },
    body: { status: 'resolved' },
  }, res);

  assert.equal(res.statusCode, 403);
});
