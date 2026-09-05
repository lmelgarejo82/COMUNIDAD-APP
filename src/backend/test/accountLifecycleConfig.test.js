const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.join(__dirname, '..', '..', '..');
const smtpVariables = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];
const emptySmtpEnvironment = Object.fromEntries(smtpVariables.map((variable) => [variable, '']));
const smtpEnvironment = {
  EMAIL_HOST: 'smtp.synthetic.test',
  EMAIL_PORT: '2525',
  EMAIL_USER: 'synthetic-user',
  EMAIL_PASS: 'synthetic-pass',
};
const ambientSmtpEnvironment = {
  EMAIL_HOST: 'smtp.ambient.synthetic.test',
  EMAIL_PORT: '2626',
  EMAIL_USER: 'ambient-synthetic-user',
  EMAIL_PASS: 'ambient-synthetic-pass',
};
const requiredComposeEnvironment = {
  JWT_SECRET: 'synthetic-jwt-secret',
  INVITATION_TOKEN_SECRET: 'synthetic-invitation-token-secret',
  PUBLIC_APP_URL: 'https://app.synthetic.test',
};

function createComposeEnvFile(t, environment = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comunidad-compose-'));
  const envFile = path.join(directory, '.env');
  const contents = Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');

  fs.writeFileSync(envFile, contents, 'utf8');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  return envFile;
}

function renderCompose(t, envFile, environment = {}) {
  const composeEnvironment = { ...process.env, ...requiredComposeEnvironment };
  for (const variable of smtpVariables) {
    delete composeEnvironment[variable];
  }

  const result = spawnSync('docker', ['compose', '--env-file', envFile, 'config', '--format', 'json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...composeEnvironment, ...emptySmtpEnvironment, ...environment },
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
  const rendered = renderCompose(t, createComposeEnvFile(t));
  if (!rendered) return;

  assert.deepEqual(backendSmtpConfiguration(rendered), {
    EMAIL_HOST: 'smtp.ethereal.email',
    EMAIL_PORT: '587',
    EMAIL_USER: '',
    EMAIL_PASS: '',
  });
});

test('Docker ignores synthetic ambient SMTP values when rendering backend defaults', (t) => {
  const rendered = renderCompose(t, createComposeEnvFile(t, ambientSmtpEnvironment));
  if (!rendered) return;

  assert.deepEqual(backendSmtpConfiguration(rendered), {
    EMAIL_HOST: 'smtp.ethereal.email',
    EMAIL_PORT: '587',
    EMAIL_USER: '',
    EMAIL_PASS: '',
  });
});

test('Docker passes supplied SMTP configuration to the backend without credentials', (t) => {
  const rendered = renderCompose(t, createComposeEnvFile(t), smtpEnvironment);
  if (!rendered) return;

  assert.deepEqual(backendSmtpConfiguration(rendered), {
    EMAIL_HOST: smtpEnvironment.EMAIL_HOST,
    EMAIL_PORT: smtpEnvironment.EMAIL_PORT,
    EMAIL_USER: smtpEnvironment.EMAIL_USER,
    EMAIL_PASS: smtpEnvironment.EMAIL_PASS,
  });
});
