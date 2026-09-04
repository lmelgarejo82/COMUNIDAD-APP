const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  getJwtSecret,
  getPublicAppOrigin,
  validateSecurityConfig,
} = require('../config/security');

const backendDir = path.join(__dirname, '..');
const validSecret = 'b35d-valid-configured-secret-with-enough-entropy';
const legacySecret = 'cambiar-por-secreto-seguro-en-produccion';

test('production rejects missing, empty and the known legacy JWT secret', () => {
  for (const jwtSecret of [undefined, '', '   ', legacySecret]) {
    assert.throws(
      () => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: jwtSecret }),
      { code: 'SECURITY_CONFIG_INVALID' }
    );
  }
});

test('production accepts an explicitly configured non-default JWT secret', () => {
  assert.equal(
    getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: validSecret }),
    validSecret
  );
});

test('test mode does not permit the known legacy JWT secret', () => {
  assert.throws(
    () => getJwtSecret({ NODE_ENV: 'test', JWT_SECRET: legacySecret }),
    { code: 'SECURITY_CONFIG_INVALID' }
  );
});

test('public app URL is normalized to a strict HTTP origin', () => {
  assert.equal(
    getPublicAppOrigin({ PUBLIC_APP_URL: ' https://app.example.test/ ' }),
    'https://app.example.test'
  );

  for (const value of [
    '', 'app.example.test', 'javascript:alert(1)', 'https://user@app.example.test',
    'https://app.example.test/reset', 'https://app.example.test/?next=evil',
    'https://app.example.test/#fragment',
  ]) {
    assert.throws(
      () => getPublicAppOrigin({ PUBLIC_APP_URL: value }),
      { code: 'SECURITY_CONFIG_INVALID' }
    );
  }
});

test('server fails before listening when production JWT configuration is unsafe', () => {
  for (const jwtSecret of ['', legacySecret]) {
    const result = spawnSync(process.execPath, ['server.js'], {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: jwtSecret,
        PUBLIC_APP_URL: 'https://app.example.test',
        QUEUE_ENABLED: 'false',
      },
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /Backend corriendo/);
    assert.match(result.stderr, /JWT_SECRET/);
    assert.doesNotMatch(result.stderr, /cambiar-por-secreto/);
  }
});

test('complete valid security configuration passes without exposing values', () => {
  assert.deepEqual(
    validateSecurityConfig({
      NODE_ENV: 'production',
      JWT_SECRET: validSecret,
      PUBLIC_APP_URL: 'https://app.example.test/',
    }),
    { jwtSecret: validSecret, publicAppOrigin: 'https://app.example.test' }
  );
});
