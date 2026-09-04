const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const userPath = require.resolve('../models/User');
const dbPath = require.resolve('../db');

function loadUser(query) {
  delete require.cache[userPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: { query } },
  };
  return require('../models/User').User;
}

test('reset challenge stores only the supplied hash and replaces the previous challenge', async () => {
  let call;
  const User = loadUser(async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 7, email: 'resident@example.test' }] };
  });

  assert.deepEqual(
    await User.setResetToken('resident@example.test', 'a'.repeat(64), new Date()),
    { id: 7, email: 'resident@example.test' }
  );
  assert.match(call.sql, /SET reset_token_hash = \$2, reset_token_expires = \$3/i);
  assert.match(call.sql, /RETURNING id, email/i);
  assert.doesNotMatch(call.sql, /reset_token\s*=/i);
  assert.equal(call.params[1], 'a'.repeat(64));
});

test('reset consumption atomically changes password, consumes token and revokes sessions', async () => {
  let call;
  const User = loadUser(async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 7, auth_version: 4 }] };
  });

  const result = await User.consumeResetToken('b'.repeat(64), 'password-hash');

  assert.deepEqual(result, { id: 7, auth_version: 4 });
  assert.match(call.sql, /^UPDATE users/i);
  assert.match(call.sql, /reset_token_hash = NULL/i);
  assert.match(call.sql, /reset_token_expires = NULL/i);
  assert.match(call.sql, /auth_version = auth_version \+ 1/i);
  assert.match(call.sql, /WHERE reset_token_hash = \$1[\s\S]*reset_token_expires > NOW\(\)/i);
  assert.deepEqual(call.params, ['b'.repeat(64), 'password-hash']);
});

test('authenticated password update revokes sessions in the same statement', async () => {
  let call;
  const User = loadUser(async (sql, params) => {
    call = { sql, params };
    return { rows: [{ auth_version: 2 }] };
  });

  assert.deepEqual(await User.updatePassword(7, 'password-hash'), { auth_version: 2 });
  assert.match(call.sql, /password_hash = \$2/i);
  assert.match(call.sql, /auth_version = auth_version \+ 1/i);
  assert.match(call.sql, /reset_token_hash = NULL/i);
  assert.deepEqual(call.params, [7, 'password-hash']);
});

test('database failure cannot report a partially consumed reset', async () => {
  const User = loadUser(async () => { throw new Error('forced database failure'); });
  await assert.rejects(
    User.consumeResetToken('c'.repeat(64), 'password-hash'),
    /forced database failure/
  );
});

test('migration invalidates legacy plaintext resets and adds durable session versioning', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '030_password_recovery_security.sql'),
    'utf8'
  );

  assert.match(sql, /ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR\(64\)/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0/i);
  assert.match(sql, /SET reset_token_expires = NULL[\s\S]*WHERE reset_token IS NOT NULL/i);
  assert.match(sql, /DROP COLUMN reset_token/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reset_token_hash/i);
  assert.doesNotMatch(sql, /reset_token_hash\s*=\s*reset_token/i);
});
