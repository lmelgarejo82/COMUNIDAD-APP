const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.join(__dirname, '..', '..', '..');
const smtpEnvironment = {
  EMAIL_HOST: 'smtp.synthetic.test',
  EMAIL_PORT: '2525',
  EMAIL_USER: 'synthetic-user',
  EMAIL_PASS: 'synthetic-pass',
  JWT_SECRET: 'synthetic-jwt-secret',
  INVITATION_TOKEN_SECRET: 'synthetic-invitation-token-secret',
  PUBLIC_APP_URL: 'https://app.synthetic.test',
};

test('Docker passes supplied SMTP configuration to the backend without credentials', (t) => {
  const result = spawnSync('docker', ['compose', 'config', '--format', 'json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...smtpEnvironment },
  });

  if (result.error?.code === 'ENOENT') {
    t.skip('Docker CLI is unavailable');
    return;
  }

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);

  const rendered = JSON.parse(result.stdout);
  assert.deepEqual({
    EMAIL_HOST: rendered.services.backend.environment.EMAIL_HOST,
    EMAIL_PORT: rendered.services.backend.environment.EMAIL_PORT,
    EMAIL_USER: rendered.services.backend.environment.EMAIL_USER,
    EMAIL_PASS: rendered.services.backend.environment.EMAIL_PASS,
  }, {
    EMAIL_HOST: smtpEnvironment.EMAIL_HOST,
    EMAIL_PORT: smtpEnvironment.EMAIL_PORT,
    EMAIL_USER: smtpEnvironment.EMAIL_USER,
    EMAIL_PASS: smtpEnvironment.EMAIL_PASS,
  });
});
