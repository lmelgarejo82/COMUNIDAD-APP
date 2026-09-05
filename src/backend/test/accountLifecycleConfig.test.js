const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.join(__dirname, '..', '..', '..');
const smtpVariables = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];
const smtpEnvironment = {
  EMAIL_HOST: 'smtp.synthetic.test',
  EMAIL_PORT: '2525',
  EMAIL_USER: 'synthetic-user',
  EMAIL_PASS: 'synthetic-pass',
};
const requiredComposeEnvironment = {
  JWT_SECRET: 'synthetic-jwt-secret',
  INVITATION_TOKEN_SECRET: 'synthetic-invitation-token-secret',
  PUBLIC_APP_URL: 'https://app.synthetic.test',
};

function renderCompose(t, environment = {}) {
  const composeEnvironment = { ...process.env, ...requiredComposeEnvironment };
  for (const variable of smtpVariables) {
    delete composeEnvironment[variable];
  }

  const result = spawnSync('docker', ['compose', 'config', '--format', 'json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...composeEnvironment, ...environment },
  });

  if (result.error?.code === 'ENOENT') {
    t.skip('Docker CLI is unavailable');
    return null;
  }

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function backendSmtpConfiguration(rendered) {
  return Object.fromEntries(smtpVariables.map((variable) => [
    variable,
    rendered.services.backend.environment[variable],
  ]));
}

test('Docker renders safe default SMTP configuration for the backend', (t) => {
  const rendered = renderCompose(t);
  if (!rendered) return;

  assert.deepEqual(backendSmtpConfiguration(rendered), {
    EMAIL_HOST: 'smtp.ethereal.email',
    EMAIL_PORT: '587',
    EMAIL_USER: '',
    EMAIL_PASS: '',
  });
});

test('Docker passes supplied SMTP configuration to the backend without credentials', (t) => {
  const rendered = renderCompose(t, smtpEnvironment);
  if (!rendered) return;

  assert.deepEqual(backendSmtpConfiguration(rendered), {
    EMAIL_HOST: smtpEnvironment.EMAIL_HOST,
    EMAIL_PORT: smtpEnvironment.EMAIL_PORT,
    EMAIL_USER: smtpEnvironment.EMAIL_USER,
    EMAIL_PASS: smtpEnvironment.EMAIL_PASS,
  });
});
