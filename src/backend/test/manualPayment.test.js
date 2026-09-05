const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const expensePath = require.resolve('../models/Expense');
const controllerPath = require.resolve('../controllers/expenseController');
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
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function settlesWithin(promise, timeoutMs = 100) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('controller response stalled')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function makeClient({ commitError = null } = {}) {
  const events = [];
  const releases = [];
  return {
    events,
    releases,
    async query(sql) {
      const operation = String(sql).trim().toUpperCase();
      events.push(operation);
      if (operation === 'COMMIT' && commitError) throw commitError;
      return { rows: [] };
    },
    release(discard) { releases.push(discard); },
  };
}

function loadController({ Expense, client, poolQuery, notification, whatsapp } = {}) {
  delete require.cache[controllerPath];
  mockModule(expensePath, { Expense: Expense || {} });
  mockModule(notificationPath, {
    Notification: notification || { async createForCommunity() {} },
  });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(whatsappPath, whatsapp || {
    async sendExpenseNotification() {},
    async sendPaymentConfirmation() {},
  });
  mockModule(dbPath, {
    pool: {
      async connect() { return client; },
      async query(...args) {
        return poolQuery ? poolQuery(...args) : { rows: [] };
      },
    },
  });
  return require('../controllers/expenseController');
}

function paymentRequest(overrides = {}) {
  let retained = 0;
  let cleaned = 0;
  return {
    req: {
      params: { unitExpenseId: '41' },
      user: { id: 5, role: 'residente' },
      communityId: 7,
      body: {},
      file: { filename: '11111111-1111-4111-8111-111111111111.pdf' },
      retainUploadedFile() { retained += 1; },
      async cleanupUploadedFile() { cleaned += 1; },
      ...overrides,
    },
    retained: () => retained,
    cleaned: () => cleaned,
  };
}

test('manual submission requires a real multipart proof and ignores a forged body association', async () => {
  const client = makeClient();
  let connections = 0;
  const controller = loadController({
    client,
    Expense: {
      async lockExpenseForUnitExpense() { throw new Error('must not query without proof'); },
      async findPayableUnitExpenseForUser() { return { id: 41, status: 'pending' }; },
      async updateUnitStatus() { connections += 100; return { id: 41, status: 'in_review' }; },
    },
  });
  require.cache[dbPath].exports.pool.connect = async () => { connections += 1; return client; };
  const fixture = paymentRequest({
    file: undefined,
    body: { payment_proof_url: '/uploads/foreign.pdf', filename: 'foreign.pdf' },
  });
  const res = response();

  await controller.submitPayment(fixture.req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(connections, 0);
  assert.equal(fixture.retained(), 0);
});

test('own pending or rejected expense commits the new proof before retaining it', async () => {
  for (const status of ['pending', 'rejected']) {
    const client = makeClient();
    const events = client.events;
    const oldProof = status === 'rejected' ? '/uploads/old-proof.pdf' : null;
    const Expense = {
      async lockExpenseForUnitExpense(id, communityId, db) {
        assert.equal(id, 41);
        assert.equal(communityId, 7);
        assert.equal(db, client);
        events.push('LOCK_PARENT');
        return { id: 9, community_id: 7 };
      },
      async findPayableUnitExpenseForUser(id, userId, communityId, db) {
        assert.deepEqual([id, userId, communityId, db], [41, 5, 7, client]);
        events.push('LOCK_CHILD');
        return { id: 41, expense_id: 9, status, payment_proof_url: oldProof };
      },
      async transitionUnitExpenseToReview(id, proofUrl, db) {
        events.push(`ASSOCIATE:${proofUrl}`);
        assert.equal(db, client);
        return { id, status: 'in_review', payment_proof_url: proofUrl };
      },
    };
    const controller = loadController({ client, Expense });
    const fixture = paymentRequest({
      retainUploadedFile() { events.push('RETAIN'); },
    });
    const res = response();

    await controller.submitPayment(fixture.req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'in_review');
    assert.deepEqual(events.slice(0, 5), [
      'BEGIN',
      'LOCK_PARENT',
      'LOCK_CHILD',
      'ASSOCIATE:/uploads/11111111-1111-4111-8111-111111111111.pdf',
      'COMMIT',
    ]);
    assert.equal(events[5], 'RETAIN');
    assert.deepEqual(client.releases, [undefined]);
  }
});

test('rejected proof stays until replacement commits, then its canonical file is removed', async () => {
  const { UPLOAD_DIRECTORY } = require('../services/uploadFiles');
  const oldFilename = `${require('node:crypto').randomUUID()}.pdf`;
  const oldPath = path.join(UPLOAD_DIRECTORY, oldFilename);
  fs.writeFileSync(oldPath, 'old rejected proof');
  const client = makeClient();
  try {
    const controller = loadController({
      client,
      Expense: {
        async lockExpenseForUnitExpense() { return { id: 9 }; },
        async findPayableUnitExpenseForUser() {
          assert.equal(fs.existsSync(oldPath), true);
          return { id: 41, status: 'rejected', payment_proof_url: `/uploads/${oldFilename}` };
        },
        async transitionUnitExpenseToReview(id, proofUrl) {
          assert.equal(fs.existsSync(oldPath), true);
          return { id, status: 'in_review', payment_proof_url: proofUrl };
        },
      },
    });
    const fixture = paymentRequest();
    const res = response();

    await controller.submitPayment(fixture.req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(fs.existsSync(oldPath), false);
    assert.equal(client.events.indexOf('COMMIT') >= 0, true);
  } finally {
    fs.rmSync(oldPath, { force: true });
  }
});

test('foreign or inactive ownership is a safe 404 with rollback and upload cleanup', async () => {
  const client = makeClient();
  let mutations = 0;
  const controller = loadController({
    client,
    Expense: {
      async lockExpenseForUnitExpense() { return { id: 9, community_id: 7 }; },
      async findPayableUnitExpenseForUser() { return null; },
      async transitionUnitExpenseToReview() { mutations += 1; },
    },
  });
  const fixture = paymentRequest();
  const res = response();

  await controller.submitPayment(fixture.req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(mutations, 0);
  assert.equal(fixture.cleaned(), 1);
  assert.deepEqual(client.events, ['BEGIN', 'ROLLBACK']);
});

test('in_review and paid submissions lose cleanly without replacing the existing association', async () => {
  for (const status of ['in_review', 'paid']) {
    const client = makeClient();
    let mutations = 0;
    const controller = loadController({
      client,
      Expense: {
        async lockExpenseForUnitExpense() { return { id: 9 }; },
        async findPayableUnitExpenseForUser() {
          return { id: 41, status, payment_proof_url: '/uploads/existing.pdf' };
        },
        async transitionUnitExpenseToReview() { mutations += 1; },
      },
    });
    const fixture = paymentRequest();
    const res = response();

    await controller.submitPayment(fixture.req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(mutations, 0);
    assert.equal(fixture.cleaned(), 1);
    assert.deepEqual(client.events, ['BEGIN', 'ROLLBACK']);
  }
});

test('known precommit database failure rolls back and removes the candidate proof', async () => {
  const client = makeClient();
  const controller = loadController({
    client,
    Expense: {
      async lockExpenseForUnitExpense() { return { id: 9 }; },
      async findPayableUnitExpenseForUser() { return { id: 41, status: 'pending' }; },
      async transitionUnitExpenseToReview() { throw new Error('synthetic db failure'); },
    },
  });
  const fixture = paymentRequest();
  const res = response();

  await controller.submitPayment(fixture.req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(fixture.cleaned(), 1);
  assert.equal(fixture.retained(), 0);
  assert.deepEqual(client.events, ['BEGIN', 'ROLLBACK']);
});

test('ambiguous COMMIT failure preserves the candidate proof and discards the connection', async () => {
  const client = makeClient({ commitError: new Error('connection dropped during commit') });
  const controller = loadController({
    client,
    Expense: {
      async lockExpenseForUnitExpense() { return { id: 9 }; },
      async findPayableUnitExpenseForUser() { return { id: 41, status: 'pending' }; },
      async transitionUnitExpenseToReview(id, proofUrl) {
        return { id, status: 'in_review', payment_proof_url: proofUrl };
      },
      async updateUnitStatus() { throw new Error('connection dropped during commit'); },
    },
  });
  const fixture = paymentRequest();
  const res = response();

  await controller.submitPayment(fixture.req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(fixture.retained(), 1);
  assert.equal(fixture.cleaned(), 0);
  assert.deepEqual(client.events, ['BEGIN', 'COMMIT']);
  assert.deepEqual(client.releases, [true]);
});

test('manual review approves only proof-backed in_review rows and rejection recovers proofless rows', async () => {
  const cases = [
    { action: 'approve', proof: '/uploads/proof.pdf', expectedStatus: 'paid', expectedCode: 200 },
    { action: 'approve', proof: null, expectedStatus: null, expectedCode: 409 },
    { action: 'reject', proof: null, expectedStatus: 'rejected', expectedCode: 200 },
  ];

  for (const entry of cases) {
    const client = makeClient();
    let transition = null;
    const Expense = {
      async lockExpenseForUnitExpense() { return { id: 9 }; },
      async findReviewableUnitExpense() {
        return { id: 41, status: 'in_review', payment_proof_url: entry.proof };
      },
      async transitionManualReview(id, action, db) {
        transition = action;
        assert.equal(db, client);
        return { id, status: action === 'approve' ? 'paid' : 'rejected' };
      },
    };
    const controller = loadController({ client, Expense });
    const req = {
      params: { unitExpenseId: '41' },
      user: { id: 2, role: 'admin' },
      communityId: 7,
    };
    const res = response();

    await controller[entry.action === 'approve' ? 'confirmPayment' : 'rejectPayment'](req, res);

    assert.equal(res.statusCode, entry.expectedCode);
    assert.equal(res.body?.status || null, entry.expectedStatus);
    assert.equal(transition, entry.expectedStatus ? entry.action : null);
  }
});

test('resident and access operator cannot invoke admin review controllers directly', async () => {
  for (const role of ['residente', 'access_operator']) {
    for (const method of ['confirmPayment', 'rejectPayment']) {
      const client = makeClient();
      let connections = 0;
      const controller = loadController({ client, Expense: {} });
      require.cache[dbPath].exports.pool.connect = async () => { connections += 1; return client; };
      const res = response();

      await controller[method]({
        params: { unitExpenseId: '41' },
        user: { id: 8, role },
        communityId: 7,
      }, res);

      assert.equal(res.statusCode, 403);
      assert.equal(connections, 0);
    }
  }
});

test('stale manual review action is a conflict and cannot partially transition', async () => {
  for (const status of ['pending', 'rejected', 'paid']) {
    const client = makeClient();
    let mutations = 0;
    const controller = loadController({
      client,
      Expense: {
        async lockExpenseForUnitExpense() { return { id: 9 }; },
        async findReviewableUnitExpense() { return { id: 41, status, payment_proof_url: '/uploads/proof.pdf' }; },
        async transitionManualReview() { mutations += 1; },
      },
    });
    const res = response();

    await controller.confirmPayment({
      params: { unitExpenseId: '41' },
      user: { id: 2, role: 'admin' },
      communityId: 7,
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(mutations, 0);
    assert.deepEqual(client.events, ['BEGIN', 'ROLLBACK']);
  }
});

test('committed review remains successful when optional delivery fails', async () => {
  const client = makeClient();
  const controller = loadController({
    client,
    Expense: {
      async lockExpenseForUnitExpense() { return { id: 9 }; },
      async findReviewableUnitExpense() {
        return {
          id: 41,
          status: 'in_review',
          payment_proof_url: '/uploads/proof.pdf',
          unit_number: 'A-1',
          amount_owed: '1500.00',
        };
      },
      async transitionManualReview() { return { id: 41, status: 'paid' }; },
    },
    poolQuery: async () => { throw new Error('optional lookup unavailable'); },
  });
  const res = response();

  await controller.confirmPayment({
    params: { unitExpenseId: '41' },
    user: { id: 2, role: 'admin' },
    communityId: 7,
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'paid');
  assert.deepEqual(client.events, ['BEGIN', 'COMMIT']);
});

test('manual approval releases its transaction client before bounded lookup and does not await stalled delivery', async () => {
  const client = makeClient();
  const events = client.events;
  let released = false;
  client.release = (discard) => {
    released = true;
    client.releases.push(discard);
    events.push('RELEASE');
  };
  const controller = loadController({
    client,
    Expense: {
      async lockExpenseForUnitExpense() { return { id: 9 }; },
      async findReviewableUnitExpense() {
        return {
          id: 41,
          status: 'in_review',
          payment_proof_url: '/uploads/proof.pdf',
          unit_number: 'A-1',
          amount_owed: '1500.00',
        };
      },
      async transitionManualReview() { return { id: 41, status: 'paid' }; },
    },
    poolQuery: async () => {
      events.push('OPTIONAL_LOOKUP');
      if (!released) return new Promise(() => {});
      return { rows: [{ phone: 'synthetic-phone' }] };
    },
    whatsapp: {
      async sendPaymentConfirmation() {
        events.push('STALLED_DELIVERY');
        return new Promise(() => {});
      },
    },
  });
  const res = response();
  const originalJson = res.json;
  res.json = function json(body) {
    events.push('RESPONSE');
    return originalJson.call(this, body);
  };

  await settlesWithin(controller.confirmPayment({
    params: { unitExpenseId: '41' },
    user: { id: 2, role: 'admin' },
    communityId: 7,
  }, res));

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(client.releases, [undefined]);
  assert.equal(events.indexOf('COMMIT') < events.indexOf('RELEASE'), true);
  assert.equal(events.indexOf('RELEASE') < events.indexOf('RESPONSE'), true);
  assert.equal(events.indexOf('RESPONSE') < events.indexOf('OPTIONAL_LOOKUP'), true);
  assert.equal(events.includes('STALLED_DELIVERY'), true);
});

test('manual approval preserves ambiguous COMMIT discard without optional lookup or double release', async () => {
  const client = makeClient({ commitError: new Error('connection dropped during commit') });
  let optionalLookups = 0;
  const controller = loadController({
    client,
    Expense: {
      async lockExpenseForUnitExpense() { return { id: 9 }; },
      async findReviewableUnitExpense() {
        return {
          id: 41,
          status: 'in_review',
          payment_proof_url: '/uploads/proof.pdf',
          unit_number: 'A-1',
          amount_owed: '1500.00',
        };
      },
      async transitionManualReview() { return { id: 41, status: 'paid' }; },
    },
    poolQuery: async () => { optionalLookups += 1; return { rows: [] }; },
  });
  const res = response();

  await controller.confirmPayment({
    params: { unitExpenseId: '41' },
    user: { id: 2, role: 'admin' },
    communityId: 7,
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(client.releases, [true]);
  assert.equal(optionalLookups, 0);
});

test('amount resplit rejects proof or payment activity before deleting children', async () => {
  const client = makeClient();
  let deletes = 0;
  const controller = loadController({
    client,
    Expense: {
      async findById() {
        return { id: 9, community_id: 7, fixed_amount: '100', extra_amount: '0' };
      },
      async findByIdForUpdate() {
        return { id: 9, community_id: 7, fixed_amount: '100', extra_amount: '0' };
      },
      async hasUnitExpenseActivity() { return true; },
      async deleteUnitExpenses() { deletes += 1; },
    },
  });
  const res = response();

  await controller.update({
    params: { id: '9' },
    communityId: 7,
    body: { description: 'Septiembre', fixedAmount: 110, extraAmount: 0, due_date: '2026-09-10' },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(deletes, 0);
  assert.deepEqual(client.events, ['BEGIN', 'ROLLBACK']);
});

test('allowed resplit uses one transaction client for every read and write', async () => {
  const client = makeClient();
  const clients = [];
  const Expense = {
    async findById() {
      clients.push(undefined);
      return { id: 9, community_id: 7, fixed_amount: '100', extra_amount: '0' };
    },
    async findByIdForUpdate(id, communityId, db) {
      clients.push(db);
      return { id, community_id: communityId, fixed_amount: '100', extra_amount: '0' };
    },
    async hasUnitExpenseActivity(id, db) { clients.push(db); return false; },
    async getDistinctUnits(communityId, db) { clients.push(db); return ['A-1']; },
    async deleteUnitExpenses(id, db) { clients.push(db); },
    async createUnitExpenses(id, entries, db) { clients.push(db); return entries; },
    async update(id, payload, db) { clients.push(db); return { id, ...payload }; },
    async findById() { return { id: 9 }; },
  };
  const controller = loadController({ client, Expense });
  const res = response();

  await controller.update({
    params: { id: '9' },
    communityId: 7,
    body: { description: 'Septiembre', fixedAmount: 110, extraAmount: 0, due_date: '2026-09-10' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(clients.length >= 6);
  assert.equal(clients.every((db) => db === client), true);
  assert.deepEqual(client.events, ['BEGIN', 'COMMIT']);
});

test('expense creation returns 201 after commit when optional delivery lookup fails', async () => {
  const client = makeClient();
  const Expense = {
    async getDistinctUnits() { return ['A-1']; },
    async create(payload) { return { id: 9, ...payload }; },
    async createUnitExpenses(id, entries) { return entries.map((entry, index) => ({ id: index + 1, ...entry })); },
  };
  const controller = loadController({
    client,
    Expense,
    poolQuery: async () => { throw new Error('optional directory unavailable'); },
  });
  mockModule(require.resolve('../models/User'), {
    User: { async findById() { return { id: 2, community_id: 7 }; } },
  });
  delete require.cache[controllerPath];
  const reloaded = require('../controllers/expenseController');
  const res = response();

  await reloaded.create({
    body: { description: 'Septiembre', fixedAmount: 100, extraAmount: 0, due_date: '2026-09-10' },
    user: { id: 2, role: 'admin' },
    communityId: 7,
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(client.events, ['BEGIN', 'COMMIT']);
});

test('expense creation releases its transaction client before bounded lookup and does not await stalled delivery', async () => {
  const client = makeClient();
  const events = client.events;
  let released = false;
  client.release = (discard) => {
    released = true;
    client.releases.push(discard);
    events.push('RELEASE');
  };
  const Expense = {
    async getDistinctUnits() { return ['A-1']; },
    async create(payload) { return { id: 9, ...payload }; },
    async createUnitExpenses(id, entries) {
      return entries.map((entry, index) => ({ id: index + 1, ...entry }));
    },
  };
  loadController({
    client,
    Expense,
    poolQuery: async () => {
      events.push('OPTIONAL_LOOKUP');
      if (!released) return new Promise(() => {});
      return { rows: [{ phone: 'synthetic-phone', unit_number: 'A-1' }] };
    },
    whatsapp: {
      async sendExpenseNotification() {
        events.push('STALLED_DELIVERY');
        return new Promise(() => {});
      },
    },
  });
  mockModule(require.resolve('../models/User'), {
    User: { async findById() { return { id: 2, community_id: 7 }; } },
  });
  delete require.cache[controllerPath];
  const controller = require('../controllers/expenseController');
  const res = response();
  const originalJson = res.json;
  res.json = function json(body) {
    events.push('RESPONSE');
    return originalJson.call(this, body);
  };

  await settlesWithin(controller.create({
    body: { description: 'Septiembre', fixedAmount: 100, extraAmount: 0, due_date: '2026-09-10' },
    user: { id: 2, role: 'admin' },
    communityId: 7,
  }, res));

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(res.statusCode, 201);
  assert.deepEqual(client.releases, [undefined]);
  assert.equal(events.indexOf('COMMIT') < events.indexOf('RELEASE'), true);
  assert.equal(events.indexOf('RELEASE') < events.indexOf('RESPONSE'), true);
  assert.equal(events.indexOf('RESPONSE') < events.indexOf('OPTIONAL_LOOKUP'), true);
  assert.equal(events.includes('STALLED_DELIVERY'), true);
});

test('expense creation preserves ambiguous COMMIT discard without optional lookup or double release', async () => {
  const client = makeClient({ commitError: new Error('connection dropped during commit') });
  let optionalLookups = 0;
  const Expense = {
    async getDistinctUnits() { return ['A-1']; },
    async create(payload) { return { id: 9, ...payload }; },
    async createUnitExpenses(id, entries) { return entries; },
  };
  loadController({
    client,
    Expense,
    poolQuery: async () => { optionalLookups += 1; return { rows: [] }; },
  });
  mockModule(require.resolve('../models/User'), {
    User: { async findById() { return { id: 2, community_id: 7 }; } },
  });
  delete require.cache[controllerPath];
  const controller = require('../controllers/expenseController');
  const res = response();

  await controller.create({
    body: { description: 'Septiembre', fixedAmount: 100, extraAmount: 0, due_date: '2026-09-10' },
    user: { id: 2, role: 'admin' },
    communityId: 7,
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(client.releases, [true]);
  assert.equal(optionalLookups, 0);
});

test('expense create and update return a server error when the transaction client cannot be acquired', async () => {
  const client = makeClient();
  const Expense = { async getDistinctUnits() { return ['A-1']; } };
  const controller = loadController({ client, Expense });
  require.cache[dbPath].exports.pool.connect = async () => {
    throw new Error('synthetic pool exhaustion');
  };
  mockModule(require.resolve('../models/User'), {
    User: { async findById() { return { id: 2, community_id: 7 }; } },
  });
  delete require.cache[controllerPath];
  const reloaded = require('../controllers/expenseController');

  for (const [method, req] of [
    ['create', {
      body: { description: 'Septiembre', fixedAmount: 100, extraAmount: 0, due_date: '2026-09-10' },
      user: { id: 2, role: 'admin' }, communityId: 7,
    }],
    ['update', {
      params: { id: '9' }, communityId: 7,
      body: { description: 'Septiembre', fixedAmount: 100, extraAmount: 0, due_date: '2026-09-10' },
    }],
  ]) {
    const res = response();
    await assert.doesNotReject(reloaded[method](req, res));
    assert.equal(res.statusCode, 500);
  }
});

test('known failure cleanup does not depend on a disconnected response finishing', async () => {
  const { UPLOAD_DIRECTORY } = require('../services/uploadFiles');
  const filename = `${require('node:crypto').randomUUID()}.pdf`;
  const absolutePath = path.join(UPLOAD_DIRECTORY, filename);
  fs.writeFileSync(absolutePath, 'candidate proof');
  const req = { file: { filename, path: absolutePath } };
  const res = new EventEmitter();
  res.writableFinished = false;
  const { trackUploadedFile } = require('../middleware/uploadLifecycle');
  try {
    trackUploadedFile(req, res, () => {});
    res.emit('close');
    assert.equal(fs.existsSync(absolutePath), true);

    await req.cleanupUploadedFile();

    assert.equal(fs.existsSync(absolutePath), false);
  } finally {
    fs.rmSync(absolutePath, { force: true });
  }
});

function requestMultipart(server, route, { filename, content, terminateBoundary = true, headers = {} }) {
  const boundary = '----manual-payment-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="proof"; filename="${filename}"\r\n`
    + 'Content-Type: application/octet-stream\r\n\r\n'
  );
  const tail = terminateBoundary ? Buffer.from(`\r\n--${boundary}--\r\n`) : Buffer.from('');
  const body = Buffer.concat([head, content, tail]);

  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      method: 'PUT',
      path: route,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': body.length,
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function requestRawMultipart(server, route, boundary, body) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      method: 'PUT',
      path: route,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': body.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function requestMultipartAfterFileWritten(server, route, boundary, firstChunk, finalChunk, uploadRoot) {
  const bodyLength = firstChunk.length + finalChunk.length;
  let resolveResponse;
  let rejectResponse;
  const responsePromise = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const address = server.address();
  const req = http.request({
    host: '127.0.0.1',
    port: address.port,
    method: 'PUT',
    path: route,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': bodyLength,
    },
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolveResponse({
      statusCode: res.statusCode,
      body: Buffer.concat(chunks).toString('utf8'),
    }));
  });
  req.on('error', rejectResponse);
  req.write(firstChunk);

  let observedCandidate = false;
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (fs.readdirSync(uploadRoot).some((filename) => filename.endsWith('.pdf'))) {
      observedCandidate = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  req.end(finalChunk);
  return { ...(await responsePromise), observedCandidate };
}

test('upload error mapper leaves genuine storage failures on the server-error path', async () => {
  const { handleUploadError } = require('../middleware/uploadErrors');
  const error = new Error('synthetic storage failure');
  let forwarded = null;
  const res = { headersSent: false, status() { throw new Error('must not map storage failure'); } };

  await handleUploadError(error, {}, res, (received) => { forwarded = received; });

  assert.equal(forwarded, error);
});

test('real manual upload middleware accepts canonical proof and maps invalid multipart/size to 4xx without residue', async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-proof-route-'));
  const previousUploadDir = process.env.UPLOAD_DIR;
  const modulePaths = [
    require.resolve('../routes/expenses'),
    require.resolve('../middleware/auth'),
    require.resolve('../middleware/authorize'),
    require.resolve('../middleware/setCommunity'),
    require.resolve('../middleware/logAudit'),
    require.resolve('../middleware/uploadLifecycle'),
    require.resolve('../services/uploadFiles'),
    controllerPath,
  ];
  const saved = new Map(modulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  let server;

  try {
    process.env.UPLOAD_DIR = uploadRoot;
    for (const modulePath of modulePaths) delete require.cache[modulePath];
    mockModule(require.resolve('../middleware/auth'), {
      authenticate(req, res, next) {
        req.user = { id: 5, role: req.headers['x-test-role'] || 'residente' };
        next();
      },
    });
    delete require.cache[require.resolve('../middleware/authorize')];
    mockModule(require.resolve('../middleware/setCommunity'), {
      setCommunity(req, res, next) { req.communityId = 7; next(); },
    });
    mockModule(require.resolve('../middleware/logAudit'), {
      logAudit() { return (req, res, next) => next(); },
    });
    mockModule(controllerPath, {
      submitPayment(req, res) {
        if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
        req.retainUploadedFile();
        return res.json({ filename: req.file.filename });
      },
      create() {}, update() {}, uploadFile() {}, listAllUnits() {}, listUnits() {},
      confirmPayment() {}, rejectPayment() {}, myExpenses() {}, listMyExpenses() {},
    });

    const express = require('express');
    const app = express();
    app.use('/api/expenses', require('../routes/expenses'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));

    const valid = await requestMultipart(server, '/api/expenses/unit/41/pay', {
      filename: 'resident-name.PDF',
      content: Buffer.from('synthetic proof'),
    });
    assert.equal(valid.statusCode, 200);
    const validPayload = JSON.parse(valid.body);
    assert.match(validPayload.filename, /^[0-9a-f-]{36}\.pdf$/);
    assert.equal(fs.existsSync(path.join(uploadRoot, validPayload.filename)), true);

    fs.rmSync(path.join(uploadRoot, validPayload.filename));
    const invalidType = await requestMultipart(server, '/api/expenses/unit/41/pay', {
      filename: 'malware.exe',
      content: Buffer.from('synthetic executable'),
    });
    assert.equal(invalidType.statusCode, 400);
    assert.deepEqual(fs.readdirSync(uploadRoot), []);

    const oversized = await requestMultipart(server, '/api/expenses/unit/41/pay', {
      filename: 'too-large.pdf',
      content: Buffer.alloc(5 * 1024 * 1024 + 1, 0x41),
    });
    assert.equal(oversized.statusCode, 413);
    assert.deepEqual(fs.readdirSync(uploadRoot), []);

    const malformed = await requestMultipart(server, '/api/expenses/unit/41/pay', {
      filename: 'broken.pdf',
      content: Buffer.from('partial proof'),
      terminateBoundary: false,
    });
    assert.equal(malformed.statusCode, 400);
    assert.deepEqual(fs.readdirSync(uploadRoot), []);

    const malformedBoundary = 'malformed-header-boundary';
    const malformedHeader = await requestRawMultipart(
      server,
      '/api/expenses/unit/41/pay',
      malformedBoundary,
      Buffer.from(`--${malformedBoundary}\r\nInvalid Header\r\n\r\nbody\r\n--${malformedBoundary}--\r\n`)
    );
    assert.equal(malformedHeader.statusCode, 400);
    assert.deepEqual(fs.readdirSync(uploadRoot), []);

    const partialBoundary = 'valid-then-malformed-boundary';
    const validPart = Buffer.from(
      `--${partialBoundary}\r\n`
      + 'Content-Disposition: form-data; name="proof"; filename="partial.pdf"\r\n'
      + 'Content-Type: application/pdf\r\n\r\n'
      + `synthetic proof\r\n--${partialBoundary}\r\n`
    );
    const malformedPart = Buffer.from(
      `Invalid Header\r\n\r\nbroken\r\n--${partialBoundary}--\r\n`
    );
    const validThenMalformed = await requestMultipartAfterFileWritten(
      server,
      '/api/expenses/unit/41/pay',
      partialBoundary,
      validPart,
      malformedPart,
      uploadRoot
    );
    assert.equal(validThenMalformed.observedCandidate, true);
    assert.equal(validThenMalformed.statusCode, 400);
    assert.deepEqual(fs.readdirSync(uploadRoot), []);

    const deniedReview = await requestMultipart(server, '/api/expenses/unit/41/confirm', {
      filename: 'unused.pdf',
      content: Buffer.from('unused'),
      headers: { 'x-test-role': 'access_operator' },
    });
    assert.equal(deniedReview.statusCode, 403);
    assert.deepEqual(fs.readdirSync(uploadRoot), []);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
    for (const [modulePath, cached] of saved) {
      delete require.cache[modulePath];
      if (cached) require.cache[modulePath] = cached;
    }
  }
});
