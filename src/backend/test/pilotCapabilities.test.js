const test = require('node:test');
const assert = require('node:assert/strict');

const chatControllerPath = require.resolve('../controllers/chatController');
const paymentControllerPath = require.resolve('../controllers/paymentController');
const chatContextPath = require.resolve('../models/ChatContext');
const expensePath = require.resolve('../models/Expense');
const transactionPath = require.resolve('../models/PaymentTransaction');
const notificationPath = require.resolve('../models/Notification');
const cachePath = require.resolve('../cache');
const mpPath = require.resolve('mercadopago');
const twilioPath = require.resolve('twilio');
const whatsappPath = require.resolve('../services/whatsapp');

function loadCapabilities() {
  try {
    return require('../config/capabilities');
  } catch {
    return {};
  }
}

function mockModule(path, exports) {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    sentStatus: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendStatus(code) { this.statusCode = code; this.sentStatus = code; return this; },
  };
}

function withEnv(changes, run) {
  const previous = {};
  for (const [key, value] of Object.entries(changes)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve().then(run).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('capabilities reject missing, blank, partial, and committed example credentials', () => {
  const { getCapabilities } = loadCapabilities();
  assert.equal(typeof getCapabilities, 'function', 'getCapabilities must exist');

  const unavailable = [
    {},
    { DEEPSEEK_API_KEY: '   ', MP_ACCESS_TOKEN: '\t' },
    { TWILIO_ACCOUNT_SID: 'AC-synthetic', TWILIO_AUTH_TOKEN: 'token' },
    {
      DEEPSEEK_API_KEY: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      MP_ACCESS_TOKEN: 'TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_WHATSAPP_NUMBER: '+14155238886',
    },
  ];

  for (const env of unavailable) {
    assert.deepEqual(getCapabilities(env), {
      aiAssistant: false,
      mercadoPago: false,
      automaticWhatsApp: false,
    });
  }
});

test('capabilities accept meaningful configured values including sandbox-prefixed MP tokens', () => {
  const { getCapabilities } = loadCapabilities();
  assert.equal(typeof getCapabilities, 'function', 'getCapabilities must exist');
  assert.deepEqual(getCapabilities({
    DEEPSEEK_API_KEY: 'synthetic-deepseek-value',
    MP_ACCESS_TOKEN: 'TEST-synthetic-sandbox-value',
    TWILIO_ACCOUNT_SID: 'AC-synthetic-value',
    TWILIO_AUTH_TOKEN: 'synthetic-auth-value',
    TWILIO_WHATSAPP_NUMBER: '+15550000000',
    JWT_SECRET: 'must-not-project',
  }), {
    aiAssistant: true,
    mercadoPago: true,
    automaticWhatsApp: true,
  });
});

test('GET /api/health exposes the real server capability projection and no sensitive fields', async () => {
  await withEnv({
    PORT: '0',
    DEEPSEEK_API_KEY: undefined,
    MP_ACCESS_TOKEN: undefined,
    TWILIO_ACCOUNT_SID: undefined,
    TWILIO_AUTH_TOKEN: undefined,
    TWILIO_WHATSAPP_NUMBER: undefined,
  }, async () => {
    const serverPath = require.resolve('../server');
    const expressPath = require.resolve('express');
    const securityPath = require.resolve('../config/security');
    const rateLimiterPath = require.resolve('../middleware/rateLimiter');
    const reminderPath = require.resolve('../jobs/reminders');
    const queuePath = require.resolve('../jobs/masterTicketQueue');
    const routePaths = [
      '../routes/uploads', '../routes/dashboard', '../routes/expenses', '../routes/hierarchy',
      '../routes/masterTickets', '../routes/announcements', '../routes/tickets',
      '../routes/notifications', '../routes/users', '../routes/admin', '../routes/reports',
      '../routes/payments', '../routes/webhooks', '../routes/bookings', '../routes/chat',
      '../routes/polls', '../routes/documents', '../routes/phone', '../routes/accessLogs',
      '../routes/accessInvitations', '../routes/accessPreauthorizations',
    ].map(path => require.resolve(path));
    const authRoutePath = require.resolve('../routes/auth');
    const mockedPaths = [
      serverPath, expressPath, securityPath, rateLimiterPath, reminderPath, queuePath,
      authRoutePath, ...routePaths,
    ];
    const priorCache = new Map(mockedPaths.map(path => [path, require.cache[path]]));
    const realExpress = require('express');
    const passthrough = (_req, _res, next) => next();
    let listener;
    let resolveStarted;
    let rejectStarted;
    const started = new Promise((resolve, reject) => {
      resolveStarted = resolve;
      rejectStarted = reject;
    });
    const isolatedExpress = (...args) => {
      const app = realExpress(...args);
      const realListen = app.listen.bind(app);
      app.listen = (_configuredPort, onListening) => {
        listener = realListen(0, '127.0.0.1', () => {
          try {
            onListening?.();
            resolveStarted(listener);
          } catch (error) {
            rejectStarted(error);
          }
        });
        listener.on('error', rejectStarted);
        return listener;
      };
      return app;
    };
    Object.assign(isolatedExpress, realExpress);

    mockModule(expressPath, isolatedExpress);
    mockModule(securityPath, { validateSecurityConfig: () => ({ trustProxy: false }) });
    mockModule(rateLimiterPath, {
      initializeRateLimiters: async () => ({ globalLimiter: passthrough }),
    });
    mockModule(reminderPath, { startReminders() {} });
    mockModule(queuePath, { init() {} });
    mockModule(authRoutePath, () => passthrough);
    for (const path of routePaths) mockModule(path, passthrough);
    delete require.cache[serverPath];

    try {
      require('../server');
      const runningServer = await started;
      const address = runningServer.address();
      const result = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      assert.equal(result.status, 200);
      const body = await result.json();
      assert.deepEqual(body, {
        status: 'ok',
        capabilities: {
          aiAssistant: false,
          mercadoPago: false,
          automaticWhatsApp: false,
        },
      });
      assert.deepEqual(Object.keys(body).sort(), ['capabilities', 'status']);
      assert.deepEqual(Object.keys(body.capabilities).sort(), [
        'aiAssistant', 'automaticWhatsApp', 'mercadoPago',
      ]);
      assert.equal(Object.values(body.capabilities).every(value => typeof value === 'boolean'), true);
    } finally {
      if (listener) await new Promise(resolve => listener.close(resolve));
      for (const [path, cached] of priorCache) {
        if (cached) require.cache[path] = cached;
        else delete require.cache[path];
      }
    }
  });
});

test('disabled chat returns a stable 503 before context lookup or outbound fetch', async () => {
  await withEnv({ DEEPSEEK_API_KEY: undefined }, async () => {
    let contextLookups = 0;
    let outboundCalls = 0;
    mockModule(chatContextPath, { ChatContext: { async build() { contextLookups += 1; return {}; } } });
    delete require.cache[chatControllerPath];
    const originalFetch = global.fetch;
    global.fetch = async () => { outboundCalls += 1; return { ok: true, json: async () => ({}) }; };
    try {
      const res = response();
      await require('../controllers/chatController').query(
        { body: { message: '¿Cuánto debo?' }, user: { id: 7 } },
        res
      );
      assert.equal(res.statusCode, 503);
      assert.deepEqual(res.body, {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'El asistente virtual no está disponible.',
      });
      assert.equal(contextLookups, 0);
      assert.equal(outboundCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('configured AI prompt keeps manual proof primary and omits unavailable MP promises', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'synthetic-ai-key', MP_ACCESS_TOKEN: undefined }, async () => {
    mockModule(chatContextPath, {
      ChatContext: {
        async build() {
          return {
            user: { id: 7 },
            context: {
              unit_number: '1A', role: 'residente', saldo_pendiente: 100,
              pendientes_count: 1, ultima_expensa_pagada: '-', anuncios_no_leidos: 0,
              proximas_expensas: [], amenities: [],
            },
          };
        },
      },
    });
    delete require.cache[chatControllerPath];
    let outboundBody;
    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => {
      outboundBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Respuesta' } }] }) };
    };
    try {
      const res = response();
      await require('../controllers/chatController').query(
        { body: { message: 'Quiero pagar' }, user: { id: 7 } },
        res
      );
      const prompt = outboundBody.messages[0].content;
      assert.match(prompt, /comprobante/i);
      assert.doesNotMatch(prompt, /Pagar con MP/i);
      assert.equal(res.body.reply, 'Respuesta');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('disabled MP preference and webhook return stable 503 before DB or provider work', async () => {
  await withEnv({ MP_ACCESS_TOKEN: undefined }, async () => {
    let dbCalls = 0;
    let providerCalls = 0;
    mockModule(expensePath, { Expense: { async findPayableUnitExpenseForUser() { dbCalls += 1; } } });
    mockModule(transactionPath, { PaymentTransaction: { async findByPaymentId() { dbCalls += 1; } } });
    mockModule(notificationPath, { Notification: {} });
    mockModule(cachePath, { invalidatePattern: async () => {} });
    mockModule(mpPath, {
      MercadoPagoConfig: class { constructor() { providerCalls += 1; } },
      Preference: class {},
      Payment: class { async get() { providerCalls += 1; } },
    });
    delete require.cache[paymentControllerPath];
    const controller = require('../controllers/paymentController');
    const expected = {
      code: 'CAPABILITY_UNAVAILABLE',
      message: 'Mercado Pago no está disponible.',
    };

    const preferenceRes = response();
    await controller.createPreference(
      { body: { unitExpenseId: 4 }, user: { id: 7 }, communityId: 2 },
      preferenceRes
    );
    assert.equal(preferenceRes.statusCode, 503);
    assert.deepEqual(preferenceRes.body, expected);

    const webhookRes = response();
    await controller.webhook({ body: { type: 'payment', data: { id: '9' } } }, webhookRes);
    assert.equal(webhookRes.statusCode, 503);
    assert.deepEqual(webhookRes.body, expected);
    assert.equal(dbCalls, 0);
    assert.equal(providerCalls, 0);
  });
});

test('WhatsApp incomplete config does not construct a client and complete config uses existing boundary', async () => {
  let clients = 0;
  let sends = 0;
  let lastMessage;
  mockModule(twilioPath, () => {
    clients += 1;
    return { messages: { async create(message) { sends += 1; lastMessage = message; } } };
  });

  await withEnv({
    TWILIO_ACCOUNT_SID: 'AC-synthetic',
    TWILIO_AUTH_TOKEN: 'synthetic-token',
    TWILIO_WHATSAPP_NUMBER: undefined,
  }, async () => {
    delete require.cache[whatsappPath];
    const whatsapp = require('../services/whatsapp');
    assert.equal(whatsapp.isConfigured(), false);
    await whatsapp.sendExpenseNotification({
      toPhone: '+15551111111', unitNumber: '1A', description: 'Agosto', amount: '10', dueDate: '2026-09-30',
    });
    assert.equal(clients, 0);
    assert.equal(sends, 0);
  });

  await withEnv({
    TWILIO_ACCOUNT_SID: 'AC-synthetic',
    TWILIO_AUTH_TOKEN: 'synthetic-token',
    TWILIO_WHATSAPP_NUMBER: '+15550000000',
  }, async () => {
    delete require.cache[whatsappPath];
    const whatsapp = require('../services/whatsapp');
    assert.equal(whatsapp.isConfigured(), true);
    await whatsapp.sendPaymentConfirmation({ toPhone: '+15551111111', unitNumber: '1A', amount: '10.00' });
    assert.equal(clients, 1);
    assert.equal(sends, 1);
    assert.match(lastMessage.body, /comprobante/i);
    assert.doesNotMatch(lastMessage.body, /automáticamente/i);
  });
});
