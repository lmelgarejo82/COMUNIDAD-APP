const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardControllerPath = require.resolve('../controllers/dashboardController');
const expenseControllerPath = require.resolve('../controllers/expenseController');
const ticketControllerPath = require.resolve('../controllers/ticketController');
const dashboardPath = require.resolve('../models/Dashboard');
const expensePath = require.resolve('../models/Expense');
const ticketPath = require.resolve('../models/Ticket');
const notificationPath = require.resolve('../models/Notification');
const cachePath = require.resolve('../cache');
const whatsappPath = require.resolve('../services/whatsapp');
const dbPath = require.resolve('../db');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function clearController(path) {
  delete require.cache[path];
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

test('admin dashboard uses validated request community context', async () => {
  clearController(dashboardControllerPath);
  let receivedCommunityId = null;

  mockModule(dashboardPath, {
    Dashboard: {
      async admin(communityId) {
        receivedCommunityId = communityId;
        return { total_recaudado: 10 };
      },
    },
  });

  const { admin } = require('../controllers/dashboardController');
  const res = createResponse();

  await admin({ user: { id: 1 }, communityId: 77 }, res);

  assert.equal(receivedCommunityId, 77);
  assert.deepEqual(res.body, { total_recaudado: 10 });
});

test('resident dashboard uses validated request community context', async () => {
  clearController(dashboardControllerPath);
  let received = null;

  mockModule(dashboardPath, {
    Dashboard: {
      async residente(userId, communityId) {
        received = { userId, communityId };
        return { saldo_pendiente: 0 };
      },
    },
  });

  const { residente } = require('../controllers/dashboardController');
  const res = createResponse();

  await residente({ user: { id: 5 }, communityId: 88 }, res);

  assert.deepEqual(received, { userId: 5, communityId: 88 });
  assert.deepEqual(res.body, { saldo_pendiente: 0 });
});

test('expense listing uses validated request community context', async () => {
  clearController(expenseControllerPath);
  let receivedCommunityId = null;

  mockModule(expensePath, {
    Expense: {
      async findByCommunity(communityId) {
        receivedCommunityId = communityId;
        return { data: [], total: 0 };
      },
    },
  });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(whatsappPath, {});
  mockModule(dbPath, {
    pool: {
      async connect() {
        throw new Error('should not connect');
      },
      async query() {
        throw new Error('should not query');
      },
    },
  });

  const { listMyExpenses } = require('../controllers/expenseController');
  const res = createResponse();

  await listMyExpenses({ communityId: 91, query: { page: '1' } }, res);

  assert.equal(receivedCommunityId, 91);
  assert.deepEqual(res.body, { data: [], total: 0 });
});

test('admin unit-expense listing queries by validated request community context', async () => {
  clearController(expenseControllerPath);
  let queryParams = null;

  mockModule(expensePath, { Expense: {} });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(whatsappPath, {});
  mockModule(dbPath, {
    pool: {
      async connect() {
        throw new Error('should not connect');
      },
      async query(sql, params) {
        queryParams = params;
        return { rows: [] };
      },
    },
  });

  const { listAllUnits } = require('../controllers/expenseController');
  const res = createResponse();

  await listAllUnits({ communityId: 92, query: { status: 'pending' } }, res);

  assert.deepEqual(queryParams, [92, 'pending']);
  assert.deepEqual(res.body, []);
});

test('ticket admin listing uses validated request community context', async () => {
  clearController(ticketControllerPath);
  let receivedCommunityId = null;

  mockModule(ticketPath, {
    Ticket: {
      async findByCommunity(communityId) {
        receivedCommunityId = communityId;
        return { data: [], total: 0 };
      },
    },
  });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });

  const { listAll } = require('../controllers/ticketController');
  const res = createResponse();

  await listAll({ communityId: 93, query: { status: 'sent' } }, res);

  assert.equal(receivedCommunityId, 93);
  assert.deepEqual(res.body, { data: [], total: 0 });
});

test('resident ticket listing uses user and validated request community context', async () => {
  clearController(ticketControllerPath);
  let received = null;

  mockModule(ticketPath, {
    Ticket: {
      async findByUser(userId, communityId) {
        received = { userId, communityId };
        return { data: [], total: 0 };
      },
    },
  });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });

  const { listMy } = require('../controllers/ticketController');
  const res = createResponse();

  await listMy({ user: { id: 12 }, communityId: 94, query: {} }, res);

  assert.deepEqual(received, { userId: 12, communityId: 94 });
  assert.deepEqual(res.body, { data: [], total: 0 });
});
