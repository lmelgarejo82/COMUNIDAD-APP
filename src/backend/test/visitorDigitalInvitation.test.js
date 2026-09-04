const test = require('node:test');
const assert = require('node:assert/strict');

const modelPath = require.resolve('../models/VisitorDigitalInvitation');
const preauthPath = require.resolve('../models/VisitorPreauthorization');
const dbPath = require.resolve('../db');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function loadModel({ preauthorization, onQuery, onUse = async () => null }) {
  delete require.cache[modelPath];
  mockModule(preauthPath, {
    VisitorPreauthorization: {
      async findByIdForCommunity() {
        return preauthorization;
      },
      use: onUse,
    },
  });
  mockModule(dbPath, {
    pool: {
      async query(sql, params) {
        return onQuery(sql, params);
      },
    },
  });
  return require('../models/VisitorDigitalInvitation').VisitorDigitalInvitation;
}

test('digital invitation stores token hash and never persists plain token', async () => {
  const inserts = [];
  const model = loadModel({
    preauthorization: {
      id: 12,
      community_id: 4,
      status: 'pending',
      effective_status: 'pending',
      expected_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    onQuery(sql, params) {
      if (sql.includes('INSERT INTO visitor_digital_invitations')) {
        inserts.push(params);
        return { rows: [{ id: 99 }] };
      }
      return { rows: [{ id: 99, token_hash: params[0], token_hint: 'hint', status: 'active' }] };
    },
  });

  const result = await model.create({ preauthorizationId: 12, communityId: 4, userId: 10 });
  const insertParams = inserts[0];

  assert.ok(result.token.length >= 32);
  assert.equal(insertParams[0], 4);
  assert.equal(insertParams[1], 12);
  assert.notEqual(insertParams[2], result.token);
  assert.equal(insertParams[2].length, 64);
  assert.equal(insertParams.includes(result.token), false);
});

test('JWT rotation does not invalidate an existing digital invitation', async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  let storedHash = null;
  let useCalls = 0;
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const model = loadModel({
    preauthorization: {
      id: 12,
      community_id: 4,
      status: 'pending',
      effective_status: 'pending',
      expected_until: future,
    },
    async onUse() {
      useCalls += 1;
      return {
        visit: { id: 77 },
        preauthorization: { id: 12, status: 'used' },
        alreadyUsed: false,
      };
    },
    onQuery(sql, params) {
      if (sql.includes('INSERT INTO visitor_digital_invitations')) {
        storedHash = params[2];
        return { rows: [{ id: 99 }] };
      }
      if (sql.includes('WHERE vdi.id =')) {
        return { rows: [{ id: 99, token_hash: storedHash, status: 'active' }] };
      }
      if (sql.includes('WHERE vdi.token_hash =')) {
        if (params[0] !== storedHash || params[1] !== 4) return { rows: [] };
        return { rows: [{
          id: 99,
          expires_at: future,
          preauthorization_id: 12,
          preauthorization_status: 'pending',
          preauthorization_effective_status: 'pending',
        }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  });

  try {
    const created = await model.create({ preauthorizationId: 12, communityId: 4, userId: 10 });
    process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('hex');

    const validated = await model.validateToken({ token: created.token, communityId: 4 });
    const used = await model.useToken({ token: created.token, communityId: 4, userId: 11 });

    assert.equal(validated.invitation_id, 99);
    assert.equal(used.visit.id, 77);
    assert.equal(useCalls, 1);
    assert.notEqual(storedHash, created.token);
  } finally {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test('pre-separation HMAC remains valid when the former JWT becomes the dedicated invitation secret', async () => {
  const crypto = require('node:crypto');
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalInvitationSecret = process.env.INVITATION_TOKEN_SECRET;
  const formerJwtSecret = crypto.randomBytes(48).toString('hex');
  const rotatedJwtSecret = crypto.randomBytes(48).toString('hex');
  const token = crypto.randomBytes(32).toString('base64url');
  const legacyStoredHash = crypto.createHmac('sha256', formerJwtSecret).update(token).digest('hex');
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  process.env.JWT_SECRET = rotatedJwtSecret;
  process.env.INVITATION_TOKEN_SECRET = formerJwtSecret;

  const model = loadModel({
    preauthorization: null,
    onQuery(sql, params) {
      if (!sql.includes('WHERE vdi.token_hash =')) throw new Error(`unexpected query: ${sql}`);
      if (params[0] !== legacyStoredHash || params[1] !== 4) return { rows: [] };
      return { rows: [{
        id: 88,
        expires_at: future,
        preauthorization_id: 12,
        preauthorization_status: 'pending',
        preauthorization_effective_status: 'pending',
      }] };
    },
  });

  try {
    const validated = await model.validateToken({ token, communityId: 4 });
    assert.equal(validated.invitation_id, 88);
  } finally {
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.INVITATION_TOKEN_SECRET = originalInvitationSecret;
  }
});

test('revoked and expired digital invitation records remain invalid', () => {
  const model = loadModel({
    preauthorization: null,
    onQuery() { return { rows: [] }; },
  });

  assert.throws(
    () => model.validateInvitationRecord({ revoked_at: new Date(), expires_at: new Date(Date.now() + 60_000) }),
    { code: 'INVITATION_INVALID' }
  );
  assert.throws(
    () => model.validateInvitationRecord({ revoked_at: null, expires_at: new Date(Date.now() - 60_000) }),
    { code: 'INVITATION_INVALID' }
  );
});

test('digital invitation rejects non-pending preauthorization', async () => {
  const model = loadModel({
    preauthorization: { id: 12, status: 'used', effective_status: 'used' },
    onQuery() {
      throw new Error('query should not run');
    },
  });

  await assert.rejects(
    () => model.create({ preauthorizationId: 12, communityId: 4, userId: 10 }),
    { code: 'PREAUTH_NOT_PENDING' }
  );
});
