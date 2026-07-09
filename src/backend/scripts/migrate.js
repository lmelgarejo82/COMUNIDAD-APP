require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function hasOwnTransaction(sql) {
  return /^\s*BEGIN\b/im.test(sql) || /^\s*COMMIT\b/im.test(sql);
}

function listMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function ensureSchemaMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT filename, checksum FROM schema_migrations ORDER BY filename'
  );
  return new Map(rows.map((row) => [row.filename, row.checksum]));
}

async function recordMigration(client, filename, fileChecksum) {
  await client.query(
    `INSERT INTO schema_migrations (filename, checksum)
     VALUES ($1, $2)`,
    [filename, fileChecksum]
  );
}

async function applyMigration(client, filename, sql, fileChecksum) {
  if (hasOwnTransaction(sql)) {
    await client.query(sql);
    await recordMigration(client, filename, fileChecksum);
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await recordMigration(client, filename, fileChecksum);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function runMigrations({ client, migrationsDir = MIGRATIONS_DIR, logger = console } = {}) {
  const ownClient = !client;
  const db = client || await pool.connect();
  const applied = [];
  const skipped = [];

  try {
    await ensureSchemaMigrations(db);
    const appliedMigrations = await getAppliedMigrations(db);
    const files = listMigrationFiles(migrationsDir);

    for (const filename of files) {
      const fullPath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(fullPath, 'utf8');
      const fileChecksum = checksum(sql);
      const existingChecksum = appliedMigrations.get(filename);

      if (existingChecksum) {
        if (existingChecksum !== fileChecksum) {
          throw new Error(`Checksum mismatch for applied migration ${filename}`);
        }
        skipped.push(filename);
        logger.log(`Migracion omitida: ${filename}`);
        continue;
      }

      logger.log(`Migracion pendiente: ${filename}`);
      await applyMigration(db, filename, sql, fileChecksum);
      applied.push(filename);
      logger.log(`Migracion aplicada: ${filename}`);
    }

    return { applied, skipped };
  } finally {
    if (ownClient) db.release();
  }
}

async function main() {
  try {
    const result = await runMigrations();
    console.log(`Migraciones OK. Aplicadas: ${result.applied.length}. Omitidas: ${result.skipped.length}.`);
    await pool.end();
  } catch (err) {
    console.error('Error ejecutando migraciones:', err);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MIGRATIONS_DIR,
  applyMigration,
  checksum,
  ensureSchemaMigrations,
  getAppliedMigrations,
  hasOwnTransaction,
  listMigrationFiles,
  runMigrations,
};
