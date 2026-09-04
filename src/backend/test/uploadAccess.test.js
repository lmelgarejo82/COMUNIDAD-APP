const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = require.resolve('../db');
const uploadAccessModelPath = require.resolve('../models/UploadAccess');
const uploadAccessMiddlewarePath = require.resolve('../middleware/uploadAccess');

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
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function loadUploadAccessModel(query) {
  delete require.cache[uploadAccessModelPath];
  mockModule(dbPath, { pool: { query } });
  return require('../models/UploadAccess').UploadAccess;
}

function loadUploadAccessMiddleware(isAuthorized) {
  delete require.cache[uploadAccessMiddlewarePath];
  mockModule(uploadAccessModelPath, {
    UploadAccess: { isAuthorized },
  });
  return require('../middleware/uploadAccess').authorizeUploadedFile;
}

test('upload path accepts one canonical filename and rejects traversal representations', () => {
  const {
    UPLOAD_DIRECTORY,
    canonicalStoredUploadUrl,
    resolveRequestedUpload,
  } = require('../services/uploadFiles');

  const valid = resolveRequestedUpload('/document-123.pdf');
  assert.equal(valid.fileUrl, '/uploads/document-123.pdf');
  assert.equal(path.dirname(valid.absolutePath), UPLOAD_DIRECTORY);
  assert.equal(canonicalStoredUploadUrl('/uploads/document-123.pdf'), '/uploads/document-123.pdf');

  for (const unsafe of [
    '/../package.json',
    '/%2e%2e%2fpackage.json',
    '/..%2fpackage.json',
    '/%252e%252e%252fpackage.json',
    '/nested/document.pdf',
    '/nested\\document.pdf',
    '/document%00.pdf',
    '/',
  ]) {
    assert.equal(resolveRequestedUpload(unsafe), null, unsafe);
  }

  for (const unsafe of [
    'https://foreign.example/document.pdf',
    '/uploads/../document.pdf',
    '/uploads/nested/document.pdf',
    '/other/document.pdf',
  ]) {
    assert.equal(canonicalStoredUploadUrl(unsafe), null, unsafe);
  }
});

test('file authorization query uses only trusted tenant-owned attachment associations', async () => {
  let call;
  const UploadAccess = loadUploadAccessModel(async (sql, params) => {
    call = { sql: String(sql), params };
    return { rows: [{ authorized: true }] };
  });

  assert.equal(await UploadAccess.isAuthorized('/uploads/local.pdf', {
    communityId: 7,
    userId: 5,
    role: 'residente',
  }), true);

  assert.deepEqual(call.params, ['/uploads/local.pdf', 7, 5, 'residente']);
  for (const ownerTable of ['documents', 'announcements', 'expenses', 'tickets', 'ticket_replies', 'unit_expenses']) {
    assert.match(call.sql, new RegExp(`\\b${ownerTable}\\b`, 'i'));
  }
  assert.match(call.sql, /community_id\s*=\s*\$2/i);
  assert.match(call.sql, /FROM\s+communities\s+c[\s\S]*c\.id\s*=\s*\$2[\s\S]*c\.deleted_at\s+IS\s+NULL/i);
  assert.match(call.sql, /master_ticket_id\s+IS\s+NULL/i);
  assert.match(call.sql, /unit_ownerships/i);
  assert.match(call.sql, /JOIN\s+units\s+un\s+ON\s+un\.id\s*=\s*ue\.unit_id/i);
  assert.match(call.sql, /COALESCE\(un\.is_active,\s*TRUE\)\s*=\s*TRUE/i);
  assert.match(call.sql, /un\.deleted_at\s+IS\s+NULL/i);
  assert.match(call.sql, /f\.deleted_at\s+IS\s+NULL/i);
  assert.match(call.sql, /b\.deleted_at\s+IS\s+NULL/i);
  assert.match(call.sql, /cx\.deleted_at\s+IS\s+NULL/i);
  assert.doesNotMatch(call.sql, /FROM\s+master_tickets/i);
});

test('foreign, unknown, orphan and disallowed-role files share the same safe response', async () => {
  const calls = [];
  const authorizeUploadedFile = loadUploadAccessMiddleware(async (fileUrl, context) => {
    calls.push({ fileUrl, context });
    return fileUrl === '/uploads/local.pdf' && context.role === 'residente';
  });

  const localReq = {
    path: '/local.pdf',
    user: { id: 5, role: 'residente' },
    communityId: 7,
  };
  const localRes = response();
  let localNext = false;
  await authorizeUploadedFile(localReq, localRes, () => { localNext = true; });
  assert.equal(localNext, true);
  assert.equal(localReq.authorizedUpload.fileUrl, '/uploads/local.pdf');

  const denied = [];
  for (const [requestPath, role] of [
    ['/foreign.pdf', 'residente'],
    ['/unknown.pdf', 'residente'],
    ['/orphan.pdf', 'residente'],
    ['/local.pdf', 'access_operator'],
  ]) {
    const req = { path: requestPath, user: { id: 5, role }, communityId: 7 };
    const res = response();
    await authorizeUploadedFile(req, res, () => assert.fail('denied file reached static serving'));
    denied.push({ statusCode: res.statusCode, body: res.body });
  }

  for (const result of denied) {
    assert.deepEqual(result, {
      statusCode: 404,
      body: { error: 'Archivo no encontrado' },
    });
  }
  assert.deepEqual(calls[0], {
    fileUrl: '/uploads/local.pdf',
    context: { communityId: 7, userId: 5, role: 'residente' },
  });
});

test('traversal is rejected before any ownership lookup', async () => {
  let lookups = 0;
  const authorizeUploadedFile = loadUploadAccessMiddleware(async () => {
    lookups += 1;
    return true;
  });
  const res = response();

  await authorizeUploadedFile({
    path: '/%2e%2e%2fpackage.json',
    user: { id: 5, role: 'residente' },
    communityId: 7,
  }, res, () => assert.fail('traversal reached static serving'));

  assert.equal(res.statusCode, 404);
  assert.equal(lookups, 0);
});

test('uncommitted multer files are removed while committed associations remain', async () => {
  const { UPLOAD_DIRECTORY } = require('../services/uploadFiles');
  const { trackUploadedFile } = require('../middleware/uploadLifecycle');
  const rejectedPath = path.join(UPLOAD_DIRECTORY, 'b35f-rejected-test.pdf');
  const retainedPath = path.join(UPLOAD_DIRECTORY, 'b35f-retained-test.pdf');
  fs.writeFileSync(rejectedPath, 'rejected');
  fs.writeFileSync(retainedPath, 'retained');

  try {
    const rejectedResponse = new EventEmitter();
    const rejectedRequest = { file: { path: rejectedPath, filename: path.basename(rejectedPath) } };
    trackUploadedFile(rejectedRequest, rejectedResponse, () => {});
    rejectedResponse.emit('finish');

    const retainedResponse = new EventEmitter();
    const retainedRequest = { file: { path: retainedPath, filename: path.basename(retainedPath) } };
    trackUploadedFile(retainedRequest, retainedResponse, () => {});
    retainedRequest.retainUploadedFile();
    retainedResponse.emit('finish');

    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(fs.existsSync(rejectedPath), false);
    assert.equal(fs.existsSync(retainedPath), true);
  } finally {
    for (const target of [rejectedPath, retainedPath]) {
      if (fs.existsSync(target)) fs.rmSync(target);
    }
  }
});

test('a premature response close cannot delete a file later committed by the controller', async () => {
  const { UPLOAD_DIRECTORY } = require('../services/uploadFiles');
  const { trackUploadedFile } = require('../middleware/uploadLifecycle');
  const target = path.join(UPLOAD_DIRECTORY, 'b35f-close-race-test.pdf');
  fs.writeFileSync(target, 'committed after close');

  try {
    const res = new EventEmitter();
    res.writableFinished = false;
    const req = { file: { path: target, filename: path.basename(target) } };
    trackUploadedFile(req, res, () => {});

    res.emit('close');
    req.retainUploadedFile();
    res.emit('finish');

    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(fs.existsSync(target), true);
  } finally {
    if (fs.existsSync(target)) fs.rmSync(target);
  }
});
