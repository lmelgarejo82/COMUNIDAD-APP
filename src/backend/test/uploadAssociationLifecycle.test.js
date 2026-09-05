const test = require('node:test');
const assert = require('node:assert/strict');

const announcementControllerPath = require.resolve('../controllers/announcementController');
const documentsControllerPath = require.resolve('../controllers/documentsController');
const expenseControllerPath = require.resolve('../controllers/expenseController');
const ticketControllerPath = require.resolve('../controllers/ticketController');
const announcementPath = require.resolve('../models/Announcement');
const documentPath = require.resolve('../models/Document');
const expensePath = require.resolve('../models/Expense');
const ticketPath = require.resolve('../models/Ticket');
const userPath = require.resolve('../models/User');
const notificationPath = require.resolve('../models/Notification');
const cachePath = require.resolve('../cache');
const whatsappPath = require.resolve('../services/whatsapp');
const dbPath = require.resolve('../db');

function mockModule(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request(overrides = {}) {
  let retained = 0;
  return {
    req: {
      communityId: 7,
      user: { id: 5, role: 'admin' },
      file: { filename: 'trusted.pdf' },
      body: {},
      params: {},
      retainUploadedFile() { retained += 1; },
      ...overrides,
    },
    retained: () => retained,
  };
}

test('document upload binds the selected community before retaining the file', async () => {
  delete require.cache[documentsControllerPath];
  let created = null;
  mockModule(documentPath, {
    Document: {
      async create(payload) {
        created = payload;
        return { id: 1, ...payload };
      },
    },
  });
  const { upload } = require('../controllers/documentsController');
  const fixture = request({ body: { title: 'Reglamento' } });
  const res = response();

  await upload(fixture.req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created.community_id, 7);
  assert.equal(created.file_url, '/uploads/trusted.pdf');
  assert.equal(fixture.retained(), 1);
});

test('announcement upload retains the file only after its tenant-owned row exists', async () => {
  delete require.cache[announcementControllerPath];
  mockModule(announcementPath, {
    Announcement: {
      async create(payload) { return { id: 2, ...payload }; },
    },
  });
  mockModule(notificationPath, { Notification: { async createForCommunity() {} } });
  const { create } = require('../controllers/announcementController');
  const fixture = request({ body: { title: 'Aviso', message: 'Mensaje' } });
  const res = response();

  await create(fixture.req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(fixture.retained(), 1);
});

test('ticket and reply uploads retain files after their authorized rows exist', async () => {
  delete require.cache[ticketControllerPath];
  mockModule(userPath, {
    User: { async findById() { return { id: 5, community_id: 7, unit_number: 'A-1' }; } },
  });
  mockModule(ticketPath, {
    Ticket: {
      async create(payload) { return { id: 3, status: 'sent', ...payload }; },
      async findById() { return { id: 3, community_id: 7, user_id: 5, status: 'sent', title: 'Ticket' }; },
      async addReply(payload) { return { id: 4, ...payload }; },
      async updateStatus() {},
    },
  });
  mockModule(notificationPath, { Notification: { async create() {} } });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(dbPath, { pool: { async query() { return { rows: [] }; } } });
  const controller = require('../controllers/ticketController');

  const createFixture = request({
    user: { id: 5, role: 'residente' },
    body: { title: 'Puerta', description: 'No cierra' },
  });
  const createRes = response();
  await controller.create(createFixture.req, createRes);

  const replyFixture = request({
    user: { id: 5, role: 'residente' },
    params: { id: '3' },
    body: { message: 'Información adicional' },
  });
  const replyRes = response();
  await controller.addReply(replyFixture.req, replyRes);

  assert.equal(createRes.statusCode, 201);
  assert.equal(replyRes.statusCode, 201);
  assert.equal(createFixture.retained(), 1);
  assert.equal(replyFixture.retained(), 1);
});

test('expense upload retains a file only after the local expense row is updated', async () => {
  delete require.cache[expenseControllerPath];
  mockModule(expensePath, {
    Expense: {
      async findById() { return { id: 9, community_id: 7 }; },
      async updateFile(id, fileUrl) { return { id, file_url: fileUrl }; },
    },
  });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(whatsappPath, {});
  mockModule(dbPath, { pool: {} });
  const { uploadFile } = require('../controllers/expenseController');
  const fixture = request({ params: { id: '9' } });
  const res = response();

  await uploadFile(fixture.req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { file_url: '/uploads/trusted.pdf' });
  assert.equal(fixture.retained(), 1);
});

function routeHandlers(router, routePath, method) {
  const layer = router.stack.find(candidate => (
    candidate.route?.path === routePath && candidate.route?.methods?.[method]
  ));
  assert.ok(layer, `${method.toUpperCase()} ${routePath} route not found`);
  return layer.route.stack.map(handler => handler.handle.name);
}

test('every multer upload route tracks uncommitted files before its controller', () => {
  const cases = [
    [require('../routes/documents'), '/', 'post'],
    [require('../routes/announcements'), '/', 'post'],
    [require('../routes/tickets'), '/', 'post'],
    [require('../routes/tickets'), '/:id/reply', 'post'],
    [require('../routes/expenses'), '/:id/upload-file', 'post'],
    [require('../routes/expenses'), '/unit/:unitExpenseId/pay', 'put'],
  ];

  for (const [router, routePath, method] of cases) {
    const handlers = routeHandlers(router, routePath, method);
    const trackerIndex = handlers.indexOf('trackUploadedFile');
    const errorHandlerIndex = handlers.indexOf('handleUploadError');
    assert.ok(trackerIndex >= 0, `${method.toUpperCase()} ${routePath} missing upload lifecycle`);
    assert.equal(errorHandlerIndex, handlers.length - 1);
    assert.equal(trackerIndex, errorHandlerIndex - 2);
  }
});

test('uploads route establishes auth, community and ownership before static serving', () => {
  const router = require('../routes/uploads');
  const handlers = router.stack.map(layer => layer.handle.name);

  assert.deepEqual(handlers.slice(0, 4), [
    'uploadsAuth',
    'setCommunity',
    'authorizeUploadedFile',
    'serveStatic',
  ]);
});
