const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  checksum,
  runMigrations,
} = require('../scripts/migrate');

function makeTempMigrations(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunidad-migrations-'));
  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, filename), content);
  }
  return dir;
}

function makeClient({ appliedRows = [] } = {}) {
  const queries = [];
  const records = [];

  return {
    queries,
    records,
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });

      if (/SELECT filename, checksum FROM schema_migrations/i.test(sql)) {
        return { rows: appliedRows };
      }

      if (/INSERT INTO schema_migrations/i.test(sql)) {
        records.push({ filename: params[0], checksum: params[1] });
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

test('migration runner creates schema_migrations table', async () => {
  const migrationsDir = makeTempMigrations({});
  const client = makeClient();

  await runMigrations({ client, migrationsDir, logger: { log() {} } });

  assert.equal(
    client.queries.some((q) => /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(q.sql)),
    true
  );
});

test('migration runner skips already applied migration with same checksum', async () => {
  const sql = 'CREATE TABLE already_done (id INT);';
  const migrationsDir = makeTempMigrations({ '001_done.sql': sql });
  const client = makeClient({
    appliedRows: [{ filename: '001_done.sql', checksum: checksum(sql) }],
  });

  const result = await runMigrations({ client, migrationsDir, logger: { log() {} } });

  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped, ['001_done.sql']);
  assert.equal(client.records.length, 0);
  assert.equal(client.queries.some((q) => q.sql === sql), false);
});

test('migration runner aborts when an applied migration checksum changed', async () => {
  const migrationsDir = makeTempMigrations({ '001_changed.sql': 'CREATE TABLE changed (id INT);' });
  const client = makeClient({
    appliedRows: [{ filename: '001_changed.sql', checksum: 'different-checksum' }],
  });

  await assert.rejects(
    runMigrations({ client, migrationsDir, logger: { log() {} } }),
    /Checksum mismatch for applied migration 001_changed\.sql/
  );
  assert.equal(client.records.length, 0);
});

test('migration runner applies pending migrations in filename order', async () => {
  const migrationsDir = makeTempMigrations({
    '002_second.sql': 'CREATE TABLE second (id INT);',
    '001_first.sql': 'CREATE TABLE first (id INT);',
  });
  const client = makeClient();

  const result = await runMigrations({ client, migrationsDir, logger: { log() {} } });

  assert.deepEqual(result.applied, ['001_first.sql', '002_second.sql']);
  assert.deepEqual(client.records.map((record) => record.filename), ['001_first.sql', '002_second.sql']);

  const appliedSql = client.queries
    .map((q) => q.sql)
    .filter((sql) => /^CREATE TABLE (first|second)/.test(sql));
  assert.deepEqual(appliedSql, ['CREATE TABLE first (id INT);', 'CREATE TABLE second (id INT);']);
});
