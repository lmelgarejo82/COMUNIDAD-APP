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

function loadModel({ preauthorization, onQuery }) {
  delete require.cache[modelPath];
  mockModule(preauthPath, {
    VisitorPreauthorization: {
      async findByIdForCommunity() {
        return preauthorization;
      },
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
