const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const nodemailerPath = require.resolve('nodemailer');
const servicePath = path.resolve(__dirname, '../services/accountEmail.js');
const emailEnvironmentKeys = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];
const originalEnvironment = Object.fromEntries(
  emailEnvironmentKeys.map(key => [key, process.env[key]])
);
let originalNodemailerCacheEntry;
let originalServiceCacheEntry;
let capturedTransport;
let capturedMail;

function restoreEmailEnvironment() {
  for (const key of emailEnvironmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
}

function restoreModuleCache() {
  if (originalNodemailerCacheEntry === undefined) delete require.cache[nodemailerPath];
  else require.cache[nodemailerPath] = originalNodemailerCacheEntry;

  if (originalServiceCacheEntry === undefined) delete require.cache[servicePath];
  else require.cache[servicePath] = originalServiceCacheEntry;
}

function loadServiceWithCapturedTransport() {
  originalNodemailerCacheEntry = require.cache[nodemailerPath];
  originalServiceCacheEntry = require.cache[servicePath];
  delete require.cache[nodemailerPath];
  delete require.cache[servicePath];

  require.cache[nodemailerPath] = {
    id: nodemailerPath,
    filename: nodemailerPath,
    loaded: true,
    exports: {
      createTransport(configuration) {
        capturedTransport = configuration;
        return {
          async sendMail(mail) {
            capturedMail = mail;
            return {};
          },
        };
      },
    },
  };

  return require(servicePath);
}

test.afterEach(() => {
  restoreEmailEnvironment();
  restoreModuleCache();
  capturedTransport = undefined;
  capturedMail = undefined;
  originalNodemailerCacheEntry = undefined;
  originalServiceCacheEntry = undefined;
});

test('resident invite email uses configured SMTP and contains the supplied fragment link', async () => {
  process.env.EMAIL_HOST = 'smtp.example.test';
  process.env.EMAIL_PORT = '2525';
  process.env.EMAIL_USER = 'mailer-user';
  process.env.EMAIL_PASS = 'mailer-pass';

  const service = loadServiceWithCapturedTransport();
  await service.sendResidentInviteEmail({
    email: 'resident@example.test',
    inviteUrl: 'https://app.example.test/register#token=' + 'a'.repeat(64),
    unitNumber: 'A-101',
    ownershipType: 'tenant',
  });

  assert.deepEqual(capturedTransport, {
    host: 'smtp.example.test',
    port: 2525,
    auth: { user: 'mailer-user', pass: 'mailer-pass' },
  });
  assert.equal(capturedMail.to, 'resident@example.test');
  assert.match(capturedMail.html, /register#token=/);
  assert.match(capturedMail.html, /A-101/);
  assert.match(capturedMail.html, /Inquilino/);
});

test('password reset email contains only the supplied trusted frontend URL', async () => {
  const service = loadServiceWithCapturedTransport();
  await service.sendPasswordResetEmail({
    email: 'resident@example.test',
    resetUrl: 'https://app.example.test/reset-password#token=' + 'b'.repeat(64),
  });

  assert.match(capturedMail.html, /https:\/\/app\.example\.test\/reset-password#token=/);
  assert.doesNotMatch(capturedMail.html, /api\/auth\/reset-password/);
});
