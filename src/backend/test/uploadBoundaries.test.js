const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

function mockModule(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function requestMultipart(server, { method, route, field, size }) {
  const boundary = '----upload-boundary-test';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="boundary.pdf"\r\n`
    + 'Content-Type: application/pdf\r\n\r\n'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, Buffer.alloc(size, 0x41), tail]);

  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = http.request({
      host: '127.0.0.1',
      port: address.port,
      method,
      path: route,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': body.length,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('all upload routes accept the product maximum and reject one byte more before controller writes', async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-boundaries-'));
  const previousUploadDir = process.env.UPLOAD_DIR;
  const routePaths = [
    require.resolve('../routes/expenses'),
    require.resolve('../routes/documents'),
    require.resolve('../routes/tickets'),
    require.resolve('../routes/announcements'),
  ];
  const dependencyPaths = [
    require.resolve('../middleware/auth'),
    require.resolve('../middleware/authorize'),
    require.resolve('../middleware/sanitize'),
    require.resolve('../middleware/setCommunity'),
    require.resolve('../middleware/logAudit'),
    require.resolve('../middleware/uploadLifecycle'),
    require.resolve('../services/uploadFiles'),
    require.resolve('../controllers/expenseController'),
    require.resolve('../controllers/documentsController'),
    require.resolve('../controllers/ticketController'),
    require.resolve('../controllers/announcementController'),
  ];
  const modulePaths = [...routePaths, ...dependencyPaths];
  const saved = new Map(modulePaths.map(modulePath => [modulePath, require.cache[modulePath]]));
  const controllerCalls = new Map();
  let server;

  const uploadController = name => (req, res) => {
    controllerCalls.set(name, (controllerCalls.get(name) || 0) + 1);
    req.retainUploadedFile();
    res.json({ filename: req.file.filename });
  };
  const noop = (req, res) => res.status(204).end();

  try {
    process.env.UPLOAD_DIR = uploadRoot;
    for (const modulePath of modulePaths) delete require.cache[modulePath];

    mockModule(require.resolve('../middleware/auth'), {
      authenticate(req, res, next) { req.user = { id: 5, role: 'admin' }; next(); },
    });
    mockModule(require.resolve('../middleware/authorize'), {
      authorize() { return (req, res, next) => next(); },
    });
    mockModule(require.resolve('../middleware/sanitize'), {
      sanitize() { return (req, res, next) => next(); },
    });
    mockModule(require.resolve('../middleware/setCommunity'), {
      setCommunity(req, res, next) { req.communityId = 7; next(); },
    });
    mockModule(require.resolve('../middleware/logAudit'), {
      logAudit() { return (req, res, next) => next(); },
    });
    mockModule(require.resolve('../controllers/expenseController'), {
      create: noop, update: noop, uploadFile: uploadController('expense attachment'),
      listAllUnits: noop, listUnits: noop, confirmPayment: noop, rejectPayment: noop,
      myExpenses: noop, listMyExpenses: noop, submitPayment: uploadController('payment proof'),
    });
    mockModule(require.resolve('../controllers/documentsController'), {
      upload: uploadController('document'), list: noop,
    });
    mockModule(require.resolve('../controllers/ticketController'), {
      create: uploadController('ticket'), listAll: noop, listMy: noop,
      updateStatus: noop, update: noop, addReply: uploadController('ticket reply'),
    });
    mockModule(require.resolve('../controllers/announcementController'), {
      create: uploadController('announcement'), listForAdmin: noop, listForResident: noop,
      markAsRead: noop, delete: noop,
    });

    const express = require('express');
    const app = express();
    app.use('/api/expenses', require('../routes/expenses'));
    app.use('/api/documents', require('../routes/documents'));
    app.use('/api/tickets', require('../routes/tickets'));
    app.use('/api/announcements', require('../routes/announcements'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));

    const fiveMiB = 5 * 1024 * 1024;
    const tenMiB = 10 * 1024 * 1024;
    const cases = [
      { name: 'payment proof', method: 'PUT', route: '/api/expenses/unit/41/pay', field: 'proof', max: fiveMiB },
      { name: 'document', method: 'POST', route: '/api/documents', field: 'file', max: tenMiB },
      { name: 'expense attachment', method: 'POST', route: '/api/expenses/1/upload-file', field: 'file', max: fiveMiB },
      { name: 'ticket', method: 'POST', route: '/api/tickets', field: 'file', max: fiveMiB },
      { name: 'announcement', method: 'POST', route: '/api/announcements', field: 'file', max: fiveMiB },
    ];

    const observed = [];
    for (const uploadCase of cases) {
      const accepted = await requestMultipart(server, { ...uploadCase, size: uploadCase.max });
      let acceptedBytes = null;
      if (accepted.statusCode === 200) {
        const acceptedFilename = JSON.parse(accepted.body).filename;
        acceptedBytes = fs.statSync(path.join(uploadRoot, acceptedFilename)).size;
        fs.rmSync(path.join(uploadRoot, acceptedFilename));
      }

      const rejected = await requestMultipart(server, { ...uploadCase, size: uploadCase.max + 1 });
      observed.push({
        name: uploadCase.name,
        acceptedStatus: accepted.statusCode,
        acceptedBytes,
        rejectedStatus: rejected.statusCode,
        controllerCalls: controllerCalls.get(uploadCase.name) || 0,
        residue: fs.readdirSync(uploadRoot),
      });
      for (const filename of fs.readdirSync(uploadRoot)) fs.rmSync(path.join(uploadRoot, filename));
    }

    assert.deepEqual(observed, cases.map(uploadCase => ({
      name: uploadCase.name,
      acceptedStatus: 200,
      acceptedBytes: uploadCase.max,
      rejectedStatus: 413,
      controllerCalls: 1,
      residue: [],
    })));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
    for (const [modulePath, cached] of saved) {
      if (cached) require.cache[modulePath] = cached;
      else delete require.cache[modulePath];
    }
  }
});
