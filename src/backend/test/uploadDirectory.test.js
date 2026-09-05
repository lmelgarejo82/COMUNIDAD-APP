const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendDirectory = path.resolve(__dirname, '..');
const composeFile = path.resolve(__dirname, '..', '..', '..', 'docker-compose.yml');

function runBackendChild(script, env = {}) {
  return spawnSync(process.execPath, ['-e', script], {
    cwd: backendDirectory,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('configured upload root resolves, creates and cleans only files inside that root', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-upload-root-'));
  const uploadDirectory = path.join(sandbox, 'configured');
  const outsidePath = path.join(sandbox, 'outside.pdf');
  fs.writeFileSync(outsidePath, 'must remain');

  try {
    const child = runBackendChild(`
      const fs = require('node:fs');
      const path = require('node:path');
      const uploads = require('./services/uploadFiles');
      (async () => {
        const file = uploads.resolveRequestedUpload('/proof.pdf');
        fs.writeFileSync(file.absolutePath, 'synthetic proof');
        const removed = await uploads.removeUploadedFile({ path: file.absolutePath });
        const outsideRemoved = await uploads.removeUploadedFile({ path: process.env.OUTSIDE_PATH });
        process.stdout.write(JSON.stringify({
          matches: uploads.UPLOAD_DIRECTORY === path.resolve(process.env.UPLOAD_DIR),
          directoryExists: fs.statSync(uploads.UPLOAD_DIRECTORY).isDirectory(),
          removed,
          exists: fs.existsSync(file.absolutePath),
          outsideRemoved,
          outsideExists: fs.existsSync(process.env.OUTSIDE_PATH),
          traversal: uploads.resolveRequestedUpload('/%2e%2e%2foutside.pdf'),
        }));
      })().catch((error) => {
        process.stderr.write(error.stack || String(error));
        process.exit(1);
      });
    `, { UPLOAD_DIR: uploadDirectory, OUTSIDE_PATH: outsidePath });

    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), {
      matches: true,
      directoryExists: true,
      removed: true,
      exists: false,
      outsideRemoved: false,
      outsideExists: true,
      traversal: null,
    });
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('explicitly blank upload root fails clearly', () => {
  const child = runBackendChild("require('./services/uploadFiles')", { UPLOAD_DIR: '   ' });

  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /UPLOAD_DIR debe indicar un directorio no vacío/);
});

test('configured upload root fails clearly when it cannot be a directory', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-upload-invalid-'));
  const filePath = path.join(sandbox, 'not-a-directory');
  fs.writeFileSync(filePath, 'occupied');

  try {
    const child = runBackendChild("require('./services/uploadFiles')", { UPLOAD_DIR: filePath });

    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /No se pudo preparar UPLOAD_DIR como directorio/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('omitted upload root keeps the usable local default', () => {
  const env = { ...process.env };
  delete env.UPLOAD_DIR;
  const child = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const path = require('node:path');
    const uploads = require('./services/uploadFiles');
    process.stdout.write(JSON.stringify({
      matches: uploads.UPLOAD_DIRECTORY === path.resolve(process.cwd(), 'uploads'),
      directoryExists: fs.statSync(uploads.UPLOAD_DIRECTORY).isDirectory(),
    }));
  `], { cwd: backendDirectory, env, encoding: 'utf8' });

  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { matches: true, directoryExists: true });
});

test('all upload routes write to the configured root served by the uploads route', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-upload-routes-'));
  const uploadDirectory = path.join(sandbox, 'uploads');

  try {
    const child = runBackendChild(`
      const fs = require('node:fs');
      const path = require('node:path');
      const express = require('express');

      function mock(relativePath, exports) {
        const modulePath = require.resolve(relativePath);
        require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
      }
      const pass = (req, res, next) => next();
      const noopController = (req, res) => res.status(204).end();
      const recorded = [];
      const uploadController = (req, res) => {
        recorded.push({ filename: req.file.filename, filePath: req.file.path });
        res.status(201).json({ filename: req.file.filename });
      };
      const controller = (uploadMethod) => new Proxy({}, {
        get(target, property) {
          return property === uploadMethod ? uploadController : noopController;
        },
      });

      mock('./middleware/auth', { authenticate: pass });
      mock('./middleware/authorize', { authorize: () => pass });
      mock('./middleware/setCommunity', { setCommunity: pass });
      mock('./middleware/sanitize', { sanitize: () => pass });
      mock('./middleware/logAudit', { logAudit: () => pass });
      mock('./middleware/uploadLifecycle', { trackUploadedFile: pass });
      mock('./middleware/uploadsAuth', { uploadsAuth: pass });
      mock('./middleware/uploadAccess', { authorizeUploadedFile: pass });
      mock('./controllers/documentsController', controller('upload'));
      mock('./controllers/announcementController', controller('create'));
      mock('./controllers/ticketController', controller('create'));
      mock('./controllers/expenseController', controller('uploadFile'));

      const app = express();
      app.use('/documents', require('./routes/documents'));
      app.use('/announcements', require('./routes/announcements'));
      app.use('/tickets', require('./routes/tickets'));
      app.use('/expenses', require('./routes/expenses'));
      app.use('/uploads', require('./routes/uploads'));

      const server = app.listen(0, '127.0.0.1', async () => {
        const origin = 'http://127.0.0.1:' + server.address().port;
        const cases = [
          ['/documents', 'document.pdf'],
          ['/announcements', 'announcement.pdf'],
          ['/tickets', 'ticket.pdf'],
          ['/expenses/1/upload-file', 'expense.pdf'],
        ];
        try {
          const results = [];
          for (const [route, name] of cases) {
            const form = new FormData();
            form.append('file', new Blob(['%PDF-1.4 synthetic']), name);
            const response = await fetch(origin + route, { method: 'POST', body: form });
            const payload = await response.json();
            const served = await fetch(origin + '/uploads/' + payload.filename);
            results.push({
              status: response.status,
              servedStatus: served.status,
              servedBody: await served.text(),
            });
          }
          process.stdout.write(JSON.stringify({
            results,
            pathsUseConfiguredRoot: recorded.every(file => (
              path.dirname(path.resolve(file.filePath)) === path.resolve(process.env.UPLOAD_DIR)
              && fs.existsSync(file.filePath)
            )),
          }));
        } catch (error) {
          process.stderr.write(error.stack || String(error));
          process.exitCode = 1;
        } finally {
          for (const file of recorded) {
            try { fs.rmSync(file.filePath); } catch {}
          }
          server.close();
        }
      });
    `, { UPLOAD_DIR: uploadDirectory });

    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.pathsUseConfiguredRoot, true);
    assert.deepEqual(result.results, Array.from({ length: 4 }, () => ({
      status: 201,
      servedStatus: 200,
      servedBody: '%PDF-1.4 synthetic',
    })));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('rendered Compose mounts the configured upload root from a named volume', () => {
  const child = spawnSync('docker', [
    'compose', '-p', 'comunidad-app', '-f', composeFile, 'config', '--format', 'json',
  ], {
    cwd: path.dirname(composeFile),
    env: {
      ...process.env,
      JWT_SECRET: 'test-only-jwt-secret',
      INVITATION_TOKEN_SECRET: 'test-only-invitation-secret',
      PUBLIC_APP_URL: 'http://localhost.test',
    },
    encoding: 'utf8',
  });

  assert.equal(child.status, 0, child.stderr);
  const rendered = JSON.parse(child.stdout);
  assert.equal(rendered.services.backend.environment.UPLOAD_DIR, '/app/uploads');
  assert.ok(rendered.volumes.upload_data);
  assert.ok(rendered.services.backend.volumes.some(volume => (
    volume.type === 'volume'
    && volume.source === 'upload_data'
    && volume.target === '/app/uploads'
  )));
});
