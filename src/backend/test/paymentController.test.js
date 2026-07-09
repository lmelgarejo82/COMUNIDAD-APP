const test = require('node:test');
const assert = require('node:assert/strict');

const paymentControllerPath = require.resolve('../controllers/paymentController');
const expenseControllerPath = require.resolve('../controllers/expenseController');
const expensePath = require.resolve('../models/Expense');
const paymentTransactionPath = require.resolve('../models/PaymentTransaction');
const notificationPath = require.resolve('../models/Notification');
const cachePath = require.resolve('../cache');
const whatsappPath = require.resolve('../services/whatsapp');
const dbPath = require.resolve('../db');
const mpPath = require.resolve('mercadopago');

process.env.MP_ACCESS_TOKEN = 'test-token';

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function clearControllers() {
  delete require.cache[paymentControllerPath];
  delete require.cache[expenseControllerPath];
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    sentStatus: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendStatus(code) {
      this.sentStatus = code;
      this.statusCode = code;
      return this;
    },
  };
}

test('resident cannot create MercadoPago preference for another unit expense', async () => {
  clearControllers();
  let preferenceCalled = false;

  mockModule(expensePath, {
    Expense: {
      async findPayableUnitExpenseForUser() {
        return null;
      },
    },
  });
  mockModule(paymentTransactionPath, { PaymentTransaction: {} });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(mpPath, {
    MercadoPagoConfig: class {},
    Preference: class {
      async create() {
        preferenceCalled = true;
      }
    },
  });

  const { createPreference } = require('../controllers/paymentController');
  const req = { body: { unitExpenseId: 10 }, user: { id: 5 }, communityId: 1 };
  const res = createResponse();

  await createPreference(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(preferenceCalled, false);
});

test('approved MercadoPago webhook confirms a valid internal transaction once', async () => {
  clearControllers();
  let txUpdates = 0;
  let confirmations = 0;
  let notifications = 0;

  mockModule(expensePath, {
    Expense: {
      async findUnitExpenseById(id) {
        assert.equal(id, 22);
        return { id: 22, amount_owed: '1500.00', status: 'in_review' };
      },
      async confirmUnitExpense(id) {
        confirmations += 1;
        return { id, status: 'paid' };
      },
      async findOwnerForUnitExpense(id) {
        return { id: 9, email: 'residente@demo.test' };
      },
    },
  });
  mockModule(paymentTransactionPath, {
    PaymentTransaction: {
      async findByPaymentId() {
        return null;
      },
      async findByExternalReference(ref) {
        assert.equal(ref, 'pt-valid');
        return { id: 3, unit_expense_id: 22, status: 'pending' };
      },
      async updateStatusById(id, status, paymentId) {
        txUpdates += 1;
        assert.equal(id, 3);
        assert.equal(status, 'approved');
        assert.equal(paymentId, '900');
        return { id, status, payment_id: paymentId };
      },
    },
  });
  mockModule(notificationPath, {
    Notification: {
      async create() {
        notifications += 1;
      },
    },
  });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(mpPath, {
    MercadoPagoConfig: class {},
    Preference: class {},
    Payment: class {
      async get() {
        return { id: '900', status: 'approved', external_reference: 'pt-valid' };
      }
    },
  });

  const { webhook } = require('../controllers/paymentController');
  const res = createResponse();

  await webhook({ body: { type: 'payment', action: 'payment.created', data: { id: '900' } } }, res);

  assert.equal(res.sentStatus, 200);
  assert.equal(txUpdates, 1);
  assert.equal(confirmations, 1);
  assert.equal(notifications, 1);
});

test('repeated approved MercadoPago webhook does not duplicate confirmation side effects', async () => {
  clearControllers();
  let confirmations = 0;
  let notifications = 0;

  mockModule(expensePath, {
    Expense: {
      async findUnitExpenseById() {
        return { id: 22, amount_owed: '1500.00', status: 'paid' };
      },
      async confirmUnitExpense() {
        confirmations += 1;
        return null;
      },
      async findOwnerForUnitExpense() {
        return { id: 9 };
      },
    },
  });
  mockModule(paymentTransactionPath, {
    PaymentTransaction: {
      async findByPaymentId() {
        return { id: 3, unit_expense_id: 22, status: 'approved' };
      },
      async findByExternalReference() {
        throw new Error('should not be called');
      },
      async updateStatusById() {
        return { id: 3, status: 'approved' };
      },
    },
  });
  mockModule(notificationPath, {
    Notification: {
      async create() {
        notifications += 1;
      },
    },
  });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(mpPath, {
    MercadoPagoConfig: class {},
    Preference: class {},
    Payment: class {
      async get() {
        return { id: '900', status: 'approved', external_reference: 'pt-valid' };
      }
    },
  });

  const { webhook } = require('../controllers/paymentController');
  const res = createResponse();

  await webhook({ body: { type: 'payment', data: { id: '900' } } }, res);

  assert.equal(res.sentStatus, 200);
  assert.equal(confirmations, 1);
  assert.equal(notifications, 0);
});

test('MercadoPago webhook without a valid internal reference does not confirm anything', async () => {
  clearControllers();
  let confirmations = 0;

  mockModule(expensePath, {
    Expense: {
      async confirmUnitExpense() {
        confirmations += 1;
      },
    },
  });
  mockModule(paymentTransactionPath, {
    PaymentTransaction: {
      async findByPaymentId() {
        return null;
      },
      async findByExternalReference() {
        return null;
      },
    },
  });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(mpPath, {
    MercadoPagoConfig: class {},
    Preference: class {},
    Payment: class {
      async get() {
        return { id: '901', status: 'approved', external_reference: 'missing' };
      }
    },
  });

  const { webhook } = require('../controllers/paymentController');
  const res = createResponse();

  await webhook({ body: { type: 'payment', data: { id: '901' } } }, res);

  assert.equal(res.sentStatus, 200);
  assert.equal(confirmations, 0);
});

test('admin cannot confirm a unit expense from another request community', async () => {
  clearControllers();
  let confirmed = false;

  mockModule(expensePath, {
    Expense: {
      async findUnitExpenseWithCommunity() {
        return { id: 50, status: 'in_review', expense_community_id: 2 };
      },
      async confirmUnitExpense() {
        confirmed = true;
      },
    },
  });
  mockModule(notificationPath, { Notification: {} });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  mockModule(whatsappPath, { sendPaymentConfirmation: async () => {} });
  mockModule(dbPath, {
    pool: {
      async query() {
        return { rows: [] };
      },
    },
  });

  const { confirmPayment } = require('../controllers/expenseController');
  const req = { params: { unitExpenseId: '50' }, communityId: 1 };
  const res = createResponse();

  await confirmPayment(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(confirmed, false);
});
