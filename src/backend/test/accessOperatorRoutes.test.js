const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const authPath = require.resolve('../middleware/auth');
const setCommunityPath = require.resolve('../middleware/setCommunity');
const dbPath = require.resolve('../db');
const accessPreauthorizationControllerPath = require.resolve('../controllers/accessPreauthorizationController');
const accessInvitationControllerPath = require.resolve('../controllers/accessInvitationController');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function clearRoute(routePath, controllerPath) {
  delete require.cache[routePath];
  if (controllerPath) delete require.cache[controllerPath];
  delete require.cache[accessPreauthorizationControllerPath];
  delete require.cache[accessInvitationControllerPath];
  delete require.cache[authPath];
  delete require.cache[setCommunityPath];
  delete require.cache[dbPath];
}

function authFor(role) {
  return {
    authenticate(req, res, next) {
      req.user = { id: role === 'residente' ? 20 : 10, email: `${role}@test.local`, role };
      next();
    },
  };
}

function communityNoop() {
  return {
    setCommunity(req, res, next) {
      req.communityId = 1;
      req.complexId = 1;
      req.scope = 'test';
      next();
    },
  };
}

function dbMock() {
  return {
    pool: {
      async query() {
        return { rows: [{ is_super_admin: false }] };
      },
    },
  };
}

function controllerMock(exports) {
  return new Proxy(exports, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (req, res) => res.json({ ok: true, handler: String(prop) });
    },
  });
}

async function requestRoute({ routeFile, controllerFile, controllerExports, role, method, path, mount = '/api' }) {
  const routePath = require.resolve(routeFile);
  const controllerPath = controllerFile ? require.resolve(controllerFile) : null;
  clearRoute(routePath, controllerPath);

  mockModule(authPath, authFor(role));
  mockModule(setCommunityPath, communityNoop());
  mockModule(dbPath, dbMock());
  if (controllerPath) mockModule(controllerPath, controllerMock(controllerExports || {}));
  if (routeFile === '../routes/accessPreauthorizations') {
    if (controllerPath !== accessPreauthorizationControllerPath) {
      mockModule(accessPreauthorizationControllerPath, controllerMock({}));
    }
    if (controllerPath !== accessInvitationControllerPath) {
      mockModule(accessInvitationControllerPath, controllerMock({}));
    }
  }

  const router = require(routeFile);
  const app = express();
  app.use(express.json());
  app.use(mount, router);

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}${mount}${path}`;
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('access_operator cannot create MercadoPago preference', async () => {
  const result = await requestRoute({
    routeFile: '../routes/payments',
    controllerFile: '../controllers/paymentController',
    controllerExports: {
      createPreference(req, res) {
        res.json({ ok: true });
      },
    },
    role: 'access_operator',
    method: 'POST',
    path: '/create-preference',
  });

  assert.equal(result.status, 403);
});

test('resident can still reach MercadoPago preference route', async () => {
  const result = await requestRoute({
    routeFile: '../routes/payments',
    controllerFile: '../controllers/paymentController',
    controllerExports: {
      createPreference(req, res) {
        res.json({ ok: true });
      },
    },
    role: 'residente',
    method: 'POST',
    path: '/create-preference',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
});

test('access_operator cannot access admin expense unit listing', async () => {
  const result = await requestRoute({
    routeFile: '../routes/expenses',
    controllerFile: '../controllers/expenseController',
    controllerExports: {
      listAllUnits(req, res) { res.json({ ok: true }); },
    },
    role: 'access_operator',
    method: 'GET',
    path: '/units',
  });

  assert.equal(result.status, 403);
});

test('admin can still access admin expense unit listing', async () => {
  const result = await requestRoute({
    routeFile: '../routes/expenses',
    controllerFile: '../controllers/expenseController',
    controllerExports: {
      listAllUnits(req, res) { res.json({ ok: true }); },
    },
    role: 'admin',
    method: 'GET',
    path: '/units',
  });

  assert.equal(result.status, 200);
});

test('access_operator cannot read structure tree', async () => {
  const result = await requestRoute({
    routeFile: '../routes/hierarchy',
    controllerFile: '../controllers/hierarchyController',
    controllerExports: {
      tree(req, res) { res.json({ ok: true }); },
      searchUnits(req, res) { res.json({ ok: true }); },
    },
    role: 'access_operator',
    method: 'GET',
    path: '/tree',
  });

  assert.equal(result.status, 403);
});

test('access_operator can use unit autocomplete', async () => {
  const result = await requestRoute({
    routeFile: '../routes/hierarchy',
    controllerFile: '../controllers/hierarchyController',
    controllerExports: {
      tree(req, res) { res.json({ ok: true }); },
      searchUnits(req, res) { res.json({ ok: true }); },
    },
    role: 'access_operator',
    method: 'GET',
    path: '/units/search?q=A1B',
  });

  assert.equal(result.status, 200);
});

test('access_operator can operate access logs', async () => {
  const result = await requestRoute({
    routeFile: '../routes/accessLogs',
    controllerFile: '../controllers/accessLogController',
    controllerExports: {
      list(req, res) { res.json({ ok: true }); },
      checkIn(req, res) { res.json({ ok: true }); },
      detail(req, res) { res.json({ ok: true }); },
      checkOut(req, res) { res.json({ ok: true }); },
      cancel(req, res) { res.json({ ok: true }); },
      observe(req, res) { res.json({ ok: true }); },
      unobserve(req, res) { res.json({ ok: true }); },
    },
    role: 'access_operator',
    method: 'GET',
    path: '/',
  });

  assert.equal(result.status, 200);
});

test('resident cannot operate access logs', async () => {
  const result = await requestRoute({
    routeFile: '../routes/accessLogs',
    controllerFile: '../controllers/accessLogController',
    controllerExports: {
      list(req, res) { res.json({ ok: true }); },
    },
    role: 'residente',
    method: 'GET',
    path: '/',
  });

  assert.equal(result.status, 403);
});

test('access_operator can search visitor preauthorizations', async () => {
  const result = await requestRoute({
    routeFile: '../routes/accessPreauthorizations',
    controllerFile: '../controllers/accessPreauthorizationController',
    controllerExports: {
      search(req, res) { res.json({ data: [] }); },
      use(req, res) { res.json({ ok: true }); },
    },
    role: 'access_operator',
    method: 'GET',
    path: '/search?q=Ana',
  });

  assert.equal(result.status, 200);
});

test('access_operator cannot create visitor preauthorizations', async () => {
  const result = await requestRoute({
    routeFile: '../routes/accessPreauthorizations',
    controllerFile: '../controllers/accessPreauthorizationController',
    controllerExports: {
      create(req, res) { res.json({ ok: true }); },
    },
    role: 'access_operator',
    method: 'POST',
    path: '/',
  });

  assert.equal(result.status, 403);
});

test('resident cannot access visitor preauthorizations', async () => {
  const result = await requestRoute({
    routeFile: '../routes/accessPreauthorizations',
    controllerFile: '../controllers/accessPreauthorizationController',
    controllerExports: {
      search(req, res) { res.json({ data: [] }); },
    },
    role: 'residente',
    method: 'GET',
    path: '/search?q=Ana',
  });

  assert.equal(result.status, 403);
});

test('access_operator cannot generate visitor digital invitations', async () => {
  const result = await requestRoute({
    routeFile: '../routes/accessPreauthorizations',
    controllerFile: '../controllers/accessInvitationController',
    controllerExports: {
      create(req, res) { res.json({ ok: true }); },
    },
    role: 'access_operator',
    method: 'POST',
    path: '/1/invitations',
  });

  assert.equal(result.status, 403);
});

test('resident cannot access visitor digital invitations', async () => {
  const result = await requestRoute({
    routeFile: '../routes/accessPreauthorizations',
    controllerFile: '../controllers/accessInvitationController',
    controllerExports: {
      list(req, res) { res.json({ ok: true }); },
    },
    role: 'residente',
    method: 'GET',
    path: '/1/invitations',
  });

  assert.equal(result.status, 403);
});
