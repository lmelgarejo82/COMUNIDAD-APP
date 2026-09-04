const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = require.resolve('../db');
const userPath = require.resolve('../models/User');
const invitePath = require.resolve('../models/Invite');
const expensePath = require.resolve('../models/Expense');
const hierarchyPath = require.resolve('../models/Hierarchy');

function mockModule(modulePath, exports) {
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
}

function loadModel(modulePath, query) {
  delete require.cache[modulePath];
  mockModule(dbPath, { pool: { query } });
  return require(modulePath);
}

test('user identity exposes unit compatibility fields only through the exact active ownership', async () => {
  let call;
  const { User } = loadModel(userPath, async (sql, params) => {
    call = { sql: String(sql), params };
    return { rows: [{ id: 5, unit_id: 11, unit_number: 'A-101', user_type: 'tenant', community_id: 7 }] };
  });

  const user = await User.findById(5);

  assert.equal(user.unit_id, 11);
  assert.match(call.sql, /uo\.unit_id = usr\.unit_id/);
  assert.match(call.sql, /cx\.community_id = usr\.community_id/);
  assert.match(call.sql, /uo\.start_date IS NULL OR uo\.start_date <= NOW\(\)/);
  assert.match(call.sql, /uo\.end_date IS NULL OR uo\.end_date > NOW\(\)/);
  assert.deepEqual(call.params, [5]);
});

test('owner capability is checked in active ownerships within the requested community', async () => {
  let call;
  const { User } = loadModel(userPath, async (sql, params) => {
    call = { sql: String(sql), params };
    return { rows: [{ '?column?': 1 }] };
  });

  assert.equal(await User.hasActiveOwnership(5, 7, 'owner'), true);
  assert.match(call.sql, /FROM unit_ownerships/);
  assert.match(call.sql, /cx\.community_id = \$2/);
  assert.match(call.sql, /uo\.ownership_type = \$3/);
  assert.match(call.sql, /uo\.start_date IS NULL OR uo\.start_date <= NOW\(\)/);
  assert.deepEqual(call.params, [5, 7, 'owner']);
});

test('invite acceptance locks an unused invite and revalidates its active unit community', async () => {
  delete require.cache[invitePath];
  mockModule(dbPath, { pool: {} });
  mockModule(hierarchyPath, { Hierarchy: {} });
  const { Invite } = require(invitePath);
  let call;
  const client = {
    async query(sql, params) {
      call = { sql: String(sql), params };
      return { rows: [] };
    },
  };

  assert.equal(await Invite.findForAcceptance('token', client), null);
  assert.match(call.sql, /i\.used = FALSE/);
  assert.match(call.sql, /i\.expires_at > NOW\(\)/);
  assert.match(call.sql, /cx\.community_id = i\.community_id/);
  assert.match(call.sql, /FOR UPDATE OF i, un/);
  assert.deepEqual(call.params, ['token']);
});

test('invite creation repeats unit tenant scope in the authoritative insert', async () => {
  delete require.cache[invitePath];
  let call;
  mockModule(dbPath, { pool: {
    async query(sql, params) {
      call = { sql: String(sql), params };
      return { rows: [{ id: 20 }] };
    },
  } });
  const { Invite } = require(invitePath);

  await Invite.create({
    email: 'resident@example.test', community_id: 7, unit_id: 11,
    ownership_type: 'owner', created_by: 2,
  });

  assert.match(call.sql, /INSERT INTO invites[\s\S]*SELECT/);
  assert.match(call.sql, /un\.id = \$3/);
  assert.match(call.sql, /cx\.community_id = \$2/);
  assert.match(call.sql, /COALESCE\(un\.is_active, TRUE\) = TRUE/);
  assert.deepEqual(call.params.slice(0, 4), ['resident@example.test', 7, 11, 'owner']);
});

test('payment authorization excludes future-dated ownerships', async () => {
  let call;
  const { Expense } = loadModel(expensePath, async (sql, params) => {
    call = { sql: String(sql), params };
    return { rows: [] };
  });

  await Expense.findPayableUnitExpenseForUser(30, 5, 7);

  assert.match(call.sql, /uo\.start_date IS NULL OR uo\.start_date <= NOW\(\)/);
  assert.match(call.sql, /e\.community_id = \$3/);
  assert.deepEqual(call.params, [30, 5, 7]);
});

test('new migration persists only the actual ownership enum on invites', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '028_invite_ownership_type.sql'),
    'utf8'
  );

  assert.match(sql, /ADD COLUMN IF NOT EXISTS ownership_type VARCHAR\(10\)/i);
  assert.match(sql, /ALTER COLUMN ownership_type SET NOT NULL/i);
  assert.match(sql, /CHECK \(ownership_type IN \('owner', 'tenant'\)\)/i);
});

test('migration 029 expires only ambiguous pending invites without rewriting used history', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '029_invalidate_legacy_invites.sql'),
    'utf8'
  );

  assert.match(sql, /filename = '028_invite_ownership_type\.sql'/i);
  assert.match(sql, /SET expires_at = LEAST\(expires_at, ownership_cutoff\)/i);
  assert.match(sql, /used IS NOT TRUE/i);
  assert.match(sql, /created_at IS NULL OR created_at <= ownership_cutoff/i);
  assert.doesNotMatch(sql, /SET\s+used\s*=/i);
  assert.doesNotMatch(sql, /UPDATE\s+invites[\s\S]*ownership_type\s*=/i);
});
