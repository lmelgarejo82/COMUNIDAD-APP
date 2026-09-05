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
